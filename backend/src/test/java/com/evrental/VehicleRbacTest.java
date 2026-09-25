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
 *
 * <p>The transition rules live in VehicleTransitionPolicy: fleet roles run
 * the bike lifecycle, every role works the workshop, and only fleet and admin
 * roles retire a bike.
 */
class VehicleRbacTest extends VehicleTestBase {

    @BeforeEach
    void seedVehicle() {
        insertVehicle("BLRSS0820", "CH-820", VehicleState.READY_TO_DEPLOY);
        insertVehicle("BLRSS0823", "CH-823", VehicleState.QC_PENDING);
    }

    @Test
    void fleetStaffCanListVehicles() throws Exception {
        mvc.perform(get("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isOk());
    }

    @Test
    void fleetStaffCanCreateAVehicle() throws Exception {
        mvc.perform(post("/api/v1/vehicles")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id":"BLRSS0821","chassisNumber":"CH-821","model":"Eagle 2",
                                 "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2026-09-01"}
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void fleetStaffCanRunAFleetTransition() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0820/transitions")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void fleetStaffCannotRetireAVehicle() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0820/transitions")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"RETIRED\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void serviceManagerCanRunAWorkshopTransitionButCannotCreate() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0823/transitions")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"READY_TO_DEPLOY\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/vehicles")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id":"BLRSS0824","chassisNumber":"CH-824","model":"Eagle 2",
                                 "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2026-09-01"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void serviceManagerCannotRunAFleetTransition() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0820/transitions")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL))
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
    void aFleetAdminCanDoAllThree() throws Exception {
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