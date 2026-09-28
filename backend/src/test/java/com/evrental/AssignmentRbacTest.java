package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Who may record an assignment event. The Assignments section in RBAC.md is
 * SA/FA/FS; SERVICE_MANAGER never sees it, and nobody acts without a token.
 */
class AssignmentRbacTest extends AssignmentTestBase {

    @Test
    void noTokenIsA401() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void serviceManagerCannotAssign() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isForbidden());
    }

    @Test
    void serviceManagerCannotExchange() throws Exception {
        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                 "damageItems":[]}
                                """.formatted(RIDER_A, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isForbidden());
    }

    @Test
    void serviceManagerCannotDeboard() throws Exception {
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isForbidden());
    }

    @Test
    void fleetStaffCanAssign() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isOk());
    }

    @Test
    void superAdminCanAssign() throws Exception {
        // The super admin acts within the platform tenant (UserListTest pins
        // that scoping), so the happy path uses a platform rider and bike.
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(SUPER_ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_PLATFORM, VEHICLE_PLATFORM)))
                .andExpect(status().isOk());
    }

    @Test
    void anotherTenantsAdminCannotActOnThisTenantsRider() throws Exception {
        // RLS hides RIDER_A from OTHER_TENANT's callers, so the assign 404s
        // rather than touching another operator's register.
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(OTHER_FLEET_ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A, VEHICLE_READY)))
                .andExpect(status().isNotFound());
    }
}