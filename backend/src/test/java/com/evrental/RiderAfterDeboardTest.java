package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * What happens to a rider after the bike comes back.
 *
 * <p>Two things did not. A deboarded rider was unreachable: {@code
 * assignable()} filters on {@code status == ACTIVE}, {@code markDeboarded} is
 * the only writer of DEBOARDED, and nothing anywhere could write ACTIVE back.
 * Re-onboarding, which the deboard's own comment names as the way back, 409s
 * on the phone number. So the register had a one-way door and the assign
 * screen said "every active rider already has a bike", which was true and
 * useless.
 *
 * <p>And the bike they just handed back was nowhere on their profile: the
 * vehicle side has {@code historyFor(vehicleId)} and the rider side had no
 * equivalent, so a closed assignment was readable from the bike and invisible
 * from the person.
 */
class RiderAfterDeboardTest extends AssignmentTestBase {

    private void assign(java.util.UUID riderId, String vehicleId) throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(riderCode(riderId), vehicleId)))
                .andExpect(status().isOk());
    }

    private void deboard(java.util.UUID riderId, String vehicleId) throws Exception {
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(riderCode(riderId), vehicleId)))
                .andExpect(status().isOk());
    }

    /**
     * Deboarding is "done with that bike", not leaving: the rider stays on
     * the assign list, marked Deboarded, and the explicit reactivate still
     * works for a desk that wants to put them back without a bike.
     */
    @Test
    void aDeboardedRiderStaysOnTheAssignListMarkedDeboarded() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY);

        mvc.perform(get("/api/v1/riders/assignable")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(RIDER_A_CODE)).value("DEBOARDED"));

        // The door back, for a desk that wants them active without a bike yet.
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/reactivate")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.currentVehicleId").doesNotExist());

        mvc.perform(get("/api/v1/riders/assignable")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.id == '%s')]".formatted(RIDER_A_CODE)).isNotEmpty());
    }

    /** And once back, they can actually hold a bike again. */
    @Test
    void aReactivatedRiderCanBeAssignedAgain() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/reactivate")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-29"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY_2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVehicleId").value(VEHICLE_READY_2));
    }

    /** Reactivating somebody who never left is a no-op, not an error. */
    @Test
    void reactivatingAnActiveRiderIsHarmless() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/reactivate")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void reactivateIsGatedLikeTheRestOfTheRegister() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/reactivate")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL)))
                .andExpect(status().isForbidden());
    }

    @Test
    void theRidersProfileKeepsTheBikeTheyHandedBack() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY);

        mvc.perform(get("/api/v1/riders/" + RIDER_A_CODE)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVehicleId").doesNotExist())
                .andExpect(jsonPath("$.assignments.length()").value(1))
                .andExpect(jsonPath("$.assignments[0].vehicleId").value(VEHICLE_READY))
                .andExpect(jsonPath("$.assignments[0].startedOn").isNotEmpty())
                .andExpect(jsonPath("$.assignments[0].endedOn").value("2026-09-28"))
                .andExpect(jsonPath("$.assignments[0].reason").value("RETURNED"));
    }

    /** Newest first, and the open one is still listed while it is open. */
    @Test
    void theHistoryListsEveryBikeNewestFirst() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY);
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/reactivate")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-29"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY_2)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/riders/" + RIDER_A_CODE)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignments.length()").value(2))
                .andExpect(jsonPath("$.assignments[0].vehicleId").value(VEHICLE_READY_2))
                .andExpect(jsonPath("$.assignments[0].endedOn").doesNotExist())
                .andExpect(jsonPath("$.assignments[1].vehicleId").value(VEHICLE_READY));
    }

    @Test
    void aRiderWhoNeverHeldABikeHasAnEmptyHistoryRatherThanNoField() throws Exception {
        mvc.perform(get("/api/v1/riders/" + RIDER_C_CODE)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignments").isArray())
                .andExpect(jsonPath("$.assignments.length()").value(0));
    }
}
