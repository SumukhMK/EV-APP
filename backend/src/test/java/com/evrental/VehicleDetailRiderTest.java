package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The list and the detail of the same bike must name the same rider.
 *
 * <p>They did not. {@code VehicleResponse.from(v, riders.get(v.getId()))} on
 * the list path is handed the current rider from a batch read, while
 * {@code VehicleDetailResponse.from} passed a literal {@code null, null} —
 * so the fleet list named the rider and the detail page one click later said
 * the bike had nobody on it.
 *
 * <p>Invisible in a mock build, because the mock derives both from the same
 * fixture. It only appears in the build that is demonstrated.
 */
class VehicleDetailRiderTest extends AssignmentTestBase {

    @Test
    void theDetailNamesTheRiderTheListNames() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk());

        // The list, which was always right.
        mvc.perform(get("/api/v1/vehicles")
                        .param("q", VEHICLE_READY)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(VEHICLE_READY))
                .andExpect(jsonPath("$.content[0].currentRiderId").value(RIDER_A_CODE))
                .andExpect(jsonPath("$.content[0].currentRiderName").value("Anil Shetty"));

        // The detail of the same bike, which was not.
        mvc.perform(get("/api/v1/vehicles/" + VEHICLE_READY)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentRiderId").value(RIDER_A_CODE))
                .andExpect(jsonPath("$.currentRiderName").value("Anil Shetty"));
    }

    /** A bike nobody is on still says so, rather than naming a stale rider. */
    @Test
    void anUnassignedBikeHasNoRiderOnTheDetail() throws Exception {
        mvc.perform(get("/api/v1/vehicles/" + VEHICLE_READY_2)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentRiderId").doesNotExist())
                .andExpect(jsonPath("$.currentRiderName").doesNotExist());
    }
}
