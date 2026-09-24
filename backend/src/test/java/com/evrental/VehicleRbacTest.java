package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The 403 cases only pass because GlobalExceptionHandler handles
 * AccessDeniedException. Without it a method-security denial falls into the
 * catch-all and returns 500.
 */
class VehicleRbacTest extends VehicleTestBase {

    @BeforeEach
    void seedVehicle() {
        insertVehicle("BLRSS0820", "CH-820", VehicleState.READY_TO_DEPLOY);
    }

    @Test
    void fleetStaffCanListVehicles() throws Exception {
        mvc.perform(get("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isOk());
    }

    @Test
    void fleetStaffCannotCreateAVehicle() throws Exception {
        mvc.perform(post("/api/v1/vehicles")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id":"BLRSS0821","chassisNumber":"CH-821","model":"Eagle 2",
                                 "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2026-09-01"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void fleetStaffCannotTransitionAVehicle() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0820/transitions")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void aRequestWithNoTokenIs401() throws Exception {
        mvc.perform(get("/api/v1/vehicles"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Not signed in"));
    }

    @Test
    void aTenantAdminCanDoAllThree() throws Exception {
        mvc.perform(get("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/vehicles")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id":"BLRSS0822","chassisNumber":"CH-822","model":"Eagle 2",
                                 "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2026-09-01"}
                                """))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/v1/vehicles/BLRSS0820/transitions")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\"}"))
                .andExpect(status().isOk());
    }
}
