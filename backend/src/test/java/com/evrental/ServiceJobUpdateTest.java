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

/** Working a job: moving queues, pricing it, and what the bike does in step. */
class ServiceJobUpdateTest extends ServiceJobTestBase {

    private String token;
    private UUID jobId;

    @BeforeEach
    void openOne() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        jobId = openJob(token, "BLRSS0428", "MINOR");
    }

    private String update(String body) throws Exception {
        return mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void pricesTheJobAndTotalsIt() throws Exception {
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                                  "workSummary":"Panel and brake lever replaced",
                                  "items":[{"label":"Left panel","costPaise":85000,"kind":"PART"},
                                           {"label":"Labour — 2hr","costPaise":60000,"kind":"LABOUR"}],
                                  "technician":"Raju","note":"Upgraded from a scratch"}
                                 """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCostPaise").value(145000))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.technician").value("Raju"))
                // A job somebody has worked is no longer merely open.
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
    }

    @Test
    void replacesCostLinesWholesaleRatherThanAppending() throws Exception {
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                "items":[{"label":"Left panel","costPaise":85000,"kind":"PART"}]}
               """);
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                "items":[{"label":"Mirror","costPaise":20000,"kind":"PART"}]}
               """);

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].label").value("Mirror"))
                .andExpect(jsonPath("$.totalCostPaise").value(20000));
    }

    @Test
    void leavesTheCostingAloneWhenASaveCarriesNoItems() throws Exception {
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                "items":[{"label":"Left panel","costPaise":85000,"kind":"PART"}]}
               """);
        // A note-only save must not wipe the costing somebody else just entered.
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR","note":"Waiting on the rider to call back"}
               """);

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.totalCostPaise").value(85000));
    }

    @Test
    void movingQueueMovesTheBikeWithIt() throws Exception {
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Repaired"}
                                 """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.queue").value("QC_PENDING"));

        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.QC_PENDING);
    }

    @Test
    void stayingInTheSameQueueWritesNoStateChange() throws Exception {
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR","workSummary":"Still on the bench"}
               """);
        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.UNDER_REPAIR);
    }

    /** Review Focus 5: the state machine's refusal is the right answer, in its own words. */
    @Test
    void surfacesTheStateMachinesRefusalWhenAQueueImpliesAnIllegalMove() throws Exception {
        // UNDER_REPAIR cannot become READY_TO_DEPLOY without passing QC first.
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"READY_TO_DEPLOY","damageCategory":"MINOR"}
                                 """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value("A vehicle that is In Service cannot become Ready to Deploy"));

        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.UNDER_REPAIR);
    }

    @Test
    void refusesToChangeAClosedJob() throws Exception {
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[],"liability":"COMPANY","technician":"Raju"}
                                 """))
                .andExpect(status().isOk());

        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"MINOR_REPAIR","damageCategory":"MINOR"}
                                 """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This job is closed and cannot be changed"));
    }

    @Test
    void refusesANegativeCostLine() throws Exception {
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                                  "items":[{"label":"Refund","costPaise":-500,"kind":"OTHER"}]}
                                 """))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void refusesACostLineWithNoLabel() throws Exception {
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                                  "items":[{"label":"   ","costPaise":500}]}
                                 """))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void defaultsAnUnlabelledKindToOther() throws Exception {
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR",
                "items":[{"label":"Shop rag","costPaise":1000}]}
               """);

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.items[0].kind").value("OTHER"));
    }

    @Test
    void logsEveryMoveAgainstTheJob() throws Exception {
        update("""
               {"queue":"PARTS_WAITING","damageCategory":"MINOR","reference":"PO-4471"}
               """);

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.activity.length()").value(2))
                .andExpect(jsonPath("$.activity[1].note")
                        .value("Moved from Minor repair to Waiting for parts"))
                .andExpect(jsonPath("$.reference").value("PO-4471"));
    }

    @Test
    void refusesAJobThatIsNotThere() throws Exception {
        mvc.perform(put("/api/v1/service/jobs/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"MINOR_REPAIR","damageCategory":"MINOR"}
                                 """))
                .andExpect(status().isNotFound());
    }
}
