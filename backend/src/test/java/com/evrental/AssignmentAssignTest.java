package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Assign: a bike goes out to a rider. One rider, one bike — the register's
 * oldest rule — and a bike can only leave the yard from READY_TO_DEPLOY.
 */
class AssignmentAssignTest extends AssignmentTestBase {

    @Test
    void assignsABikeToARider() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(RIDER_A_CODE))
                .andExpect(jsonPath("$.currentVehicleId").value(VEHICLE_READY))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // The bike is out, and the open assignment row is the single source of
        // truth for who has it.
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.DEPLOYED);
        Integer openAssignments = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM assignments
                WHERE tenant_id = ? AND rider_id = ? AND ended_on IS NULL
                """, Integer.class, TENANT, RIDER_A));
        org.assertj.core.api.Assertions.assertThat(openAssignments).isEqualTo(1);
    }

    @Test
    void anUnknownRiderIsA404() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(java.util.UUID.randomUUID(), VEHICLE_READY)))
                .andExpect(status().isNotFound());
    }

    @Test
    void anInactiveRiderCannotHoldABike() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_DEBOARDED_CODE, VEHICLE_READY)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Vinod Naik is deboarded and cannot hold a bike"))
                .andExpect(jsonPath("$.field").value("riderId"));
    }

    @Test
    void aRiderHoldingABikeCannotBeAssignedAnother() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY_2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Anil Shetty already holds " + VEHICLE_READY + ". Use Exchange vehicle instead."))
                .andExpect(jsonPath("$.field").value("riderId"));
    }

    @Test
    void anUnknownBikeIsA404() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"BLRSS9999","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE)))
                .andExpect(status().isNotFound());
    }

    @Test
    void aBikeThatIsNotReadyToDeployCannotBeAssigned() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_DEPLOYED)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(VEHICLE_DEPLOYED + " is not Ready to Deploy"))
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    @Test
    void aBikeWithARiderCannotBeAssigned() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_C_CODE, VEHICLE_READY)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(VEHICLE_READY + " is not Ready to Deploy"))
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    @Test
    void anotherTenantsRiderIsA404NotALeak() throws Exception {
        // RLS hides RIDER_B from TENANT's callers, so the assign must 404
        // rather than put a bike on another operator's rider.
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_B_CODE, VEHICLE_READY)))
                .andExpect(status().isNotFound());
    }

    @Test
    void missingFieldsAreA422() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnprocessableEntity());
    }

    private void assign(UUID riderId, String vehicleId) throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(riderCode(riderId), vehicleId)))
                .andExpect(status().isOk());
    }
}