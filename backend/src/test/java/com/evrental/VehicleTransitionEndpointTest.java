package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class VehicleTransitionEndpointTest extends VehicleTestBase {

    @BeforeEach
    void seedVehicle() {
        insertVehicle("BLRSS0810", "CH-810", VehicleState.READY_TO_DEPLOY);
        insertVehicle(OTHER_TENANT, "BLRSS0811", "CH-811", VehicleState.READY_TO_DEPLOY);
        insertVehicle("BLRSS0812", "CH-812", VehicleState.UNDER_REPAIR);
    }

    @Test
    void aLegalMoveReturnsTheUpdatedVehicle() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0810/transitions")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\",\"note\":\"Assigned\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("DEPLOYED"));
    }

    @Test
    void anIllegalMoveIs409WithBothStatesNamedInUiWords() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0812/transitions")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("In Service"),
                        org.hamcrest.Matchers.containsString("Active"))));
    }

    @Test
    void anUnknownStateIs422() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0810/transitions")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"TELEPORTED\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void anotherTenantsVehicleIs404() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0811/transitions")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void theNoteIsRecordedOnTheEvent() throws Exception {
        mvc.perform(post("/api/v1/vehicles/BLRSS0810/transitions")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toState\":\"DEPLOYED\",\"note\":\"Handed to rider\"}"))
                .andExpect(status().isOk());

        Integer events = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicle_lifecycle_events e JOIN vehicles v ON v.id = e.vehicle_id "
                        + "WHERE v.registry_id = 'BLRSS0810' AND e.note = 'Handed to rider'", Integer.class));
        org.assertj.core.api.Assertions.assertThat(events).isEqualTo(1);
    }
}
