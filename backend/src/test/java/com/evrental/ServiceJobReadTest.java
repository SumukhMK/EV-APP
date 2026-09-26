package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Reading jobs back: the list, its filters, the detail, and the queue strip. */
class ServiceJobReadTest extends ServiceJobTestBase {

    private String token;

    @BeforeEach
    void openAFew() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        insertVehicle(TENANT, "BLRSS0501", "CHASSIS0501", VehicleState.DEPLOYED);
        insertVehicle(TENANT, "BLRSS0502", "CHASSIS0502", VehicleState.DEPLOYED);
        openJob(token, "BLRSS0428", "MINOR");
        openJob(token, "BLRSS0501", "MAJOR");
        openJob(token, "BLRSS0502", "ACCIDENT");
    }

    private org.springframework.test.web.servlet.ResultActions list(String query) throws Exception {
        return mvc.perform(get("/api/v1/service/jobs" + query).header("Authorization", "Bearer " + token));
    }

    @Test
    void listsEveryJobNewestFirst() throws Exception {
        list("")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content.length()").value(3))
                // Newest first: the desk works what just arrived.
                .andExpect(jsonPath("$.content[0].vehicleId").value("BLRSS0502"));
    }

    @Test
    void filtersByQueue() throws Exception {
        list("?queue=ACCIDENT")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].vehicleId").value("BLRSS0502"));
    }

    @Test
    void filtersByVehicleUsingTheRegistryIdAnOperatorReads() throws Exception {
        list("?vehicleId=BLRSS0501")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].damageCategory").value("MAJOR"));
    }

    @Test
    void anUnknownBikeFiltersToNothingRatherThanEverything() throws Exception {
        // The dangerous failure is treating "no such bike" as "no filter" and
        // returning the whole list.
        list("?vehicleId=NOSUCHBIKE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void filtersByStatus() throws Exception {
        list("?status=OPEN").andExpect(jsonPath("$.totalElements").value(3));
        list("?status=CLOSED").andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void filtersBySource() throws Exception {
        list("?source=DEBOARD").andExpect(jsonPath("$.totalElements").value(3));
        list("?source=RSA").andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void pagesTheList() throws Exception {
        list("?page=0&size=2")
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void aListRowCarriesNoChildCollections() throws Exception {
        // Three extra queries a page to show nothing is three too many.
        list("")
                .andExpect(jsonPath("$.content[0].activity.length()").value(0))
                .andExpect(jsonPath("$.content[0].items.length()").value(0))
                .andExpect(jsonPath("$.content[0].inspections.length()").value(0));
    }

    @Test
    void theDetailCarriesTheActivityLog() throws Exception {
        UUID jobId = openJobId("BLRSS0428");

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vehicleId").value("BLRSS0428"))
                .andExpect(jsonPath("$.activity.length()").value(1))
                .andExpect(jsonPath("$.damageNotes").value("Scratched left panel"));
    }

    @Test
    void countsOpenJobsInEveryQueueIncludingTheEmptyOnes() throws Exception {
        mvc.perform(get("/api/v1/service/queues/counts").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                // All nine, so a dashboard strip does not reflow as queues empty.
                .andExpect(jsonPath("$.length()").value(9))
                .andExpect(jsonPath("$[?(@.queue == 'MINOR_REPAIR')].openJobs").value(1))
                .andExpect(jsonPath("$[?(@.queue == 'ACCIDENT')].openJobs").value(1))
                .andExpect(jsonPath("$[?(@.queue == 'WARRANTY')].openJobs").value(0))
                .andExpect(jsonPath("$[?(@.queue == 'MINOR_REPAIR')].label").value("Minor repair"));
    }

    @Test
    void oneTenantNeverSeesAnothersJobs() throws Exception {
        // The rival's bike and job exist; row-level security, not a where
        // clause in our code, is what keeps them out of this answer.
        insertVehicle(OTHER_TENANT, "RIVAL0009", "RIVALCHASSIS9", VehicleState.DEPLOYED);
        superAdmin(jdbc -> jdbc.update(
                "INSERT INTO service_jobs (tenant_id, vehicle_id, source, damage_category, queue, status) "
                        + "SELECT ?, id, 'DEBOARD', 'MINOR', 'MINOR_REPAIR', 'OPEN' "
                        + "FROM vehicles WHERE registry_id = 'RIVAL0009'", OTHER_TENANT));

        list("").andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void refusesADetailReadForAJobThatIsNotThere() throws Exception {
        mvc.perform(get("/api/v1/service/jobs/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void refusesEveryReadWithoutAToken() throws Exception {
        mvc.perform(MockMvcRequestBuilders.get("/api/v1/service/jobs"))
                .andExpect(status().isUnauthorized());
    }

    private UUID openJobId(String registryId) throws Exception {
        String body = list("?vehicleId=" + registryId).andReturn().getResponse().getContentAsString();
        return UUID.fromString(new tools.jackson.databind.ObjectMapper()
                .readTree(body).get("content").get(0).get("id").asString());
    }
}
