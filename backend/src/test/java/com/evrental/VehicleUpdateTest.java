package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class VehicleUpdateTest extends VehicleTestBase {

    private static final String BODY = """
            {"make":"e-Connects","model":"Eagle 2","batteryType":"Yuma","batteryVendor":"Yuma",
             "hub":"Indiranagar","registrationNumber":"KA01AB4321","motorNumber":"M-800",
             "controllerNumber":"C-800","rfidTag":"RF-800"}
            """;

    @BeforeEach
    void seedVehicle() {
        insertVehicle("BLRSS0800", "CH-800", VehicleState.DEPLOYED);
    }

    @Test
    void updatesTheEditableFields() throws Exception {
        mvc.perform(put("/api/v1/vehicles/BLRSS0800")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hub").value("Indiranagar"))
                .andExpect(jsonPath("$.rfidTag").value("RF-800"));
    }

    @Test
    void doesNotChangeTheState() throws Exception {
        mvc.perform(put("/api/v1/vehicles/BLRSS0800")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("DEPLOYED"));
    }

    @Test
    void doesNotChangeTheRegistryIdOrChassisOrInductionDate() throws Exception {
        mvc.perform(put("/api/v1/vehicles/BLRSS0800")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("}", ",\"id\":\"CHANGED\",\"chassisNumber\":\"CHANGED\",\"inductedOn\":\"2020-01-01\"}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("BLRSS0800"))
                .andExpect(jsonPath("$.chassisNumber").value("CH-800"))
                .andExpect(jsonPath("$.inductedOn").isNotEmpty());
    }

    @Test
    void writesNoLifecycleEvent() throws Exception {
        mvc.perform(put("/api/v1/vehicles/BLRSS0800")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isOk());

        mvc.perform(put("/api/v1/vehicles/BLRSS0800")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isOk());

        Integer events = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicle_lifecycle_events e JOIN vehicles v ON v.id = e.vehicle_id "
                        + "WHERE v.registry_id = 'BLRSS0800'", Integer.class));
        org.assertj.core.api.Assertions.assertThat(events).isEqualTo(0);
    }

    @Test
    void anUnknownVehicleIs404() throws Exception {
        mvc.perform(put("/api/v1/vehicles/UNKNOWN")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isNotFound());
    }

    @Test
    void anotherTenantsVehicleIs404() throws Exception {
        insertVehicle(OTHER_TENANT, "BLRSS0899", "CH-899", VehicleState.INDUCTED);

        mvc.perform(put("/api/v1/vehicles/BLRSS0899")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isNotFound());
    }

    @Test
    void aBlankModelIs422OnTheModelField() throws Exception {
        mvc.perform(put("/api/v1/vehicles/BLRSS0800")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("\"Eagle 2\"", "\"\"")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("model"));
    }
}
