package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The QC gate — the one thing standing between a repaired bike and a rider.
 *
 * <p>The check ids are the screen's (QC_CHECKS in AssistanceJob.tsx), which
 * means `roadtest`, not the design document's `road_test`.
 */
class QcInspectionTest extends ServiceJobTestBase {

    private String token;
    private UUID jobId;

    @BeforeEach
    void openAndRepair() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        jobId = openJob(token, "BLRSS0428", "MINOR");
        // Work done, bike sent to the QC bench.
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Panel replaced"}
                                 """))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions submitQc(String checks, String inspector)
            throws Exception {
        return mvc.perform(post("/api/v1/service/jobs/" + jobId + "/qc")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"checks\":" + checks + ",\"inspector\":\"" + inspector + "\"}"));
    }

    @Test
    void aCleanSheetPutsTheBikeBackInTheFleet() throws Exception {
        submitQc(ALL_CHECKS_PASS, "Suresh")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passed").value(true))
                .andExpect(jsonPath("$.inspector").value("Suresh"));

        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.READY_TO_DEPLOY);

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.queue").value("READY_TO_DEPLOY"));
    }

    @Test
    void oneFailedCheckSendsTheBikeBackToTheBench() throws Exception {
        String brakesFail = ALL_CHECKS_PASS.replace("\"brakes\":true", "\"brakes\":false");

        submitQc(brakesFail, "Suresh")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passed").value(false));

        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.UNDER_REPAIR);

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.queue").value("MINOR_REPAIR"))
                .andExpect(jsonPath("$.activity[-1:].note").value("QC failed on brakes"));
    }

    /** Review Focus 3: silence is not a pass. */
    @Test
    void refusesASheetWithAnUnansweredCheck() throws Exception {
        String missingRoadTest = ALL_CHECKS_PASS.replace(",\"roadtest\":true", "");

        submitQc(missingRoadTest, "Suresh")
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("checks"))
                .andExpect(jsonPath("$.message")
                        .value("Every safety check must be answered. Missing: roadtest"));

        // Nothing recorded, and the bike has not moved.
        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.QC_PENDING);
    }

    @Test
    void namesEveryUnansweredCheckRatherThanJustTheFirst() throws Exception {
        submitQc("{\"brakes\":true}", "Suresh")
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value(
                        "Every safety check must be answered. Missing: "
                                + "tyres, battery, lights, horn, mirrors, throttle, frame, roadtest"));
    }

    /** Review Focus 3: a tenth check is a client that disagrees about the form. */
    @Test
    void refusesACheckItDoesNotKnow() throws Exception {
        String withExtra = ALL_CHECKS_PASS.replace("{", "{\"paintwork\":true,");

        submitQc(withExtra, "Suresh")
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("checks"))
                .andExpect(jsonPath("$.message").value("Unknown safety check: paintwork"));
    }

    @Test
    void refusesTheDocumentsSpellingSoTheScreenAndTheServerAgree() throws Exception {
        // road_test is what SERVICE_MANAGEMENT.md sketches; the screen sends
        // roadtest. Accepting both would let the two drift apart unnoticed.
        String underscored = ALL_CHECKS_PASS.replace("\"roadtest\"", "\"road_test\"");

        submitQc(underscored, "Suresh")
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void requiresAnInspectorToPutTheirNameToIt() throws Exception {
        submitQc(ALL_CHECKS_PASS, "  ")
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void keepsEveryAttemptAsHistory() throws Exception {
        submitQc(ALL_CHECKS_PASS.replace("\"tyres\":true", "\"tyres\":false"), "Suresh")
                .andExpect(status().isCreated());
        // Reworked, back to QC, and this time it passes.
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"New tyres"}
                                 """))
                .andExpect(status().isOk());
        submitQc(ALL_CHECKS_PASS, "Suresh").andExpect(status().isCreated());

        mvc.perform(get("/api/v1/service/jobs/" + jobId + "/qc").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].passed").value(false))
                .andExpect(jsonPath("$[1].passed").value(true));

        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.READY_TO_DEPLOY);
    }

    @Test
    void storesTheChecksInTheOrderTheFormAsksThem() throws Exception {
        // Submitted backwards; read back canonical, so two inspections are
        // comparable however the client happened to serialise them.
        String reversed = """
                {"roadtest":true,"frame":true,"throttle":true,"mirrors":true,"horn":true,
                 "lights":true,"battery":true,"tyres":true,"brakes":true}""";

        submitQc(reversed, "Suresh").andExpect(status().isCreated());

        mvc.perform(get("/api/v1/service/jobs/" + jobId + "/qc").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].checks.brakes").value(true))
                .andExpect(jsonPath("$[0].checks.roadtest").value(true));
    }

    @Test
    void anUndamagedBikeThatFailsQcGoesForAssessmentRatherThanAGuessedQueue() throws Exception {
        UUID clean = insertVehicle(TENANT, "BLRSS0431", "CHASSIS0431", VehicleState.DEPLOYED);
        UUID inspectionJob = openJob(token, "BLRSS0431", "NONE");

        mvc.perform(post("/api/v1/service/jobs/" + inspectionJob + "/qc")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checks\":" + ALL_CHECKS_PASS.replace("\"horn\":true", "\"horn\":false")
                                + ",\"inspector\":\"Suresh\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passed").value(false));

        mvc.perform(get("/api/v1/service/jobs/" + inspectionJob).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.queue").value("ASSESSMENT"));

        assertThat(stateOf(clean)).isEqualTo(VehicleState.UNDER_REPAIR);
    }

    @Test
    void refusesQcOnAJobThatIsNotThere() throws Exception {
        mvc.perform(post("/api/v1/service/jobs/" + UUID.randomUUID() + "/qc")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checks\":" + ALL_CHECKS_PASS + ",\"inspector\":\"Suresh\"}"))
                .andExpect(status().isNotFound());
    }
}
