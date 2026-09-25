package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.service.ServiceJobClosedEvent;
import com.evrental.service.ServiceLiability;
import com.evrental.vehicle.VehicleState;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

/**
 * Closing a job: the money decision, and the one event the payment module
 * (S6) will listen for.
 */
@RecordApplicationEvents
class ServiceJobCloseTest extends ServiceJobTestBase {

    @Autowired
    ApplicationEvents applicationEvents;

    private String token;
    private UUID jobId;

    @BeforeEach
    void openPriceAndPass() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        jobId = openJob(token, "BLRSS0428", "MINOR");
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Panel replaced",
                                  "items":[{"label":"Left panel","costPaise":85000,"kind":"PART"}]}
                                 """))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/qc")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checks\":" + ALL_CHECKS_PASS + ",\"inspector\":\"Suresh\"}"))
                .andExpect(status().isCreated());
    }

    private org.springframework.test.web.servlet.ResultActions close(String body) throws Exception {
        return mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private List<ServiceJobClosedEvent> closedEvents() {
        return applicationEvents.stream(ServiceJobClosedEvent.class).toList();
    }

    @Test
    void freezesTheCostAndNamesWhoPays() throws Exception {
        close("""
              {"items":[{"label":"Left panel","costPaise":85000,"kind":"PART"},
                        {"label":"Labour — 2hr","costPaise":60000,"kind":"LABOUR"}],
               "liability":"RIDER","technician":"Raju","note":"Rider confirmed the damage"}
              """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"))
                .andExpect(jsonPath("$.liability").value("RIDER"))
                .andExpect(jsonPath("$.totalCostPaise").value(145000))
                .andExpect(jsonPath("$.closedOn").exists());

        // QC had already released it; closing finds it there and leaves it.
        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.READY_TO_DEPLOY);
    }

    @Test
    void tellsTheMoneyModuleWhenTheRiderOwes() throws Exception {
        close("""
              {"items":[{"label":"Left panel","costPaise":85000,"kind":"PART"}],
               "liability":"RIDER","technician":"Raju"}
              """).andExpect(status().isOk());

        assertThat(closedEvents()).singleElement().satisfies(event -> {
            assertThat(event.liability()).isEqualTo(ServiceLiability.RIDER);
            assertThat(event.totalCostPaise()).isEqualTo(85000);
            assertThat(event.jobId()).isEqualTo(jobId);
            assertThat(event.tenantId()).isEqualTo(TENANT);
        });
    }

    @Test
    void aDepositDeductionIsStillACharge() throws Exception {
        close("""
              {"items":[{"label":"Left panel","costPaise":85000}],"liability":"DEPOSIT"}
              """).andExpect(status().isOk());

        assertThat(closedEvents()).singleElement()
                .satisfies(event -> assertThat(event.liability()).isEqualTo(ServiceLiability.DEPOSIT));
    }

    @Test
    void theFleetAbsorbingItRaisesNoCharge() throws Exception {
        close("""
              {"items":[{"label":"Goodwill repair","costPaise":85000}],"liability":"COMPANY"}
              """).andExpect(status().isOk());

        assertThat(closedEvents()).isEmpty();
    }

    /** Review Focus 4: a rider billed twice for one repair is the failure that matters. */
    @Test
    void refusesASecondCloseAndRaisesNoSecondCharge() throws Exception {
        close("""
              {"items":[{"label":"Left panel","costPaise":85000}],"liability":"RIDER"}
              """).andExpect(status().isOk());

        close("""
              {"items":[{"label":"Left panel","costPaise":999999}],"liability":"RIDER"}
              """)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This job is already closed"));

        assertThat(closedEvents()).hasSize(1);

        // The frozen total is the one that was charged, not the second attempt's.
        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalCostPaise").value(85000))
                .andExpect(jsonPath("$.activity[?(@.note =~ /.*[Cc]losed.*/)].length()").exists());
    }

    @Test
    void refusesToCloseWithoutSayingWhoPays() throws Exception {
        close("""
              {"items":[{"label":"Left panel","costPaise":85000}]}
              """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value("Choose who pays before closing the job"));
    }

    @Test
    void closingWhileTheBikeIsStillOnTheBenchLeavesItThere() throws Exception {
        // A second bike, taken in and never QC'd: closing settles the money but
        // must not declare an unchecked bike roadworthy.
        UUID other = insertVehicle(TENANT, "BLRSS0432", "CHASSIS0432", VehicleState.DEPLOYED);
        UUID openJobId = openJob(token, "BLRSS0432", "MAJOR");

        mvc.perform(post("/api/v1/service/jobs/" + openJobId + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[],"liability":"COMPANY","note":"Written off"}
                                 """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));

        assertThat(stateOf(other)).isEqualTo(VehicleState.UNDER_REPAIR);
    }

    @Test
    void aClosedBikeCanBeTakenInAgainLater() throws Exception {
        close("""
              {"items":[],"liability":"COMPANY"}
              """).andExpect(status().isOk());

        // The partial unique index only guards *open* jobs, so the bike can
        // come back next week without anybody deleting history.
        mvc.perform(post("/api/v1/service/jobs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"vehicleId":"BLRSS0428","source":"WALK_IN","damageCategory":"MINOR"}
                                 """))
                .andExpect(status().isCreated());
    }

    @Test
    void refusesToCloseAJobThatIsNotThere() throws Exception {
        mvc.perform(post("/api/v1/service/jobs/" + UUID.randomUUID() + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[],"liability":"COMPANY"}
                                 """))
                .andExpect(status().isNotFound());
    }
}
