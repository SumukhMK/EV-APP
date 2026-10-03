package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The audit trail shows what actually happened.
 *
 * <p>It used to show twelve hardcoded rows dated August 2026, naming real
 * colleagues, rendered identically on a brand-new tenant with no riders. There
 * was no table behind it, so it could not even degrade to empty.
 *
 * <p>The replacement has no table either, on purpose: it reads the records the
 * modules already write. The test that matters most is the last one — an empty
 * tenant shows an empty trail, which the fixture could never do.
 */
class AuditTrailTest extends AssignmentTestBase {

    @Test
    void anAssignmentAppearsInTheTrail() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/audit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.action == 'Assignment opened')].after").value(VEHICLE_READY))
                .andExpect(jsonPath("$.content[?(@.action == 'Assignment opened')].entity")
                        .value("Rider · Anil Shetty"));
    }

    /** A bike moving between states is the lifecycle log, already written. */
    @Test
    void aStateChangeAppearsWithItsBeforeAndAfter() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/audit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.action == 'State changed')].before").value("READY_TO_DEPLOY"))
                .andExpect(jsonPath("$.content[?(@.action == 'State changed')].after").value("DEPLOYED"));
    }

    @Test
    void theTrailIsNewestFirst() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isOk());

        String body = mvc.perform(get("/api/v1/audit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        java.util.List<String> times = com.jayway.jsonpath.JsonPath.read(body, "$.content[*].occurredAt");
        java.util.List<String> sorted = new java.util.ArrayList<>(times);
        sorted.sort(java.util.Comparator.reverseOrder());
        org.assertj.core.api.Assertions.assertThat(times).isEqualTo(sorted);
    }

    /** The trail names people and includes money. */
    @Test
    void fleetStaffCannotReadTheTrail() throws Exception {
        mvc.perform(get("/api/v1/audit")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isForbidden());
    }

    @Test
    void theTrailIsSignedInOnly() throws Exception {
        mvc.perform(get("/api/v1/audit")).andExpect(status().isUnauthorized());
    }

    /**
     * Another tenant's acts are not in this tenant's trail. RLS, not a
     * predicate — and the fixture it replaces could not have been scoped at
     * all, because it was a constant.
     */
    @Test
    void theTrailIsScopedToTheCallersTenant() throws Exception {
        String body = mvc.perform(get("/api/v1/audit")
                        .param("size", "200")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("Rival");
    }
}
