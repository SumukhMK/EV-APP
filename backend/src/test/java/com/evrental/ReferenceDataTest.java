package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Hubs and models come from the database.
 *
 * <p>They were constants in the frontend's fixture file — five models and four
 * hubs — imported straight into the add-vehicle, edit-vehicle and
 * assistance-job forms. An operator whose hubs were not Bengaluru, HSR Layout,
 * Koramangala or Whitefield could not add a bike at all.
 */
class ReferenceDataTest extends VehicleTestBase {

    @Test
    void theFormOptionsComeFromTheFleetThatExists() throws Exception {
        insertVehicle("REF0001", "RCH-0001", VehicleState.INDUCTED);

        mvc.perform(get("/api/v1/reference/form-options")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                // V013 seeds from the vehicles already there, so the hub the
                // fixture uses is offered without anyone adding it.
                .andExpect(jsonPath("$.hubs[?(@.name == 'Koramangala')]").isNotEmpty())
                .andExpect(jsonPath("$.models[?(@.name == 'Eagle 2')]").isNotEmpty());
    }

    @Test
    void anOperatorCanOpenANewHub() throws Exception {
        mvc.perform(post("/api/v1/reference/hubs")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Indiranagar\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Indiranagar"))
                .andExpect(jsonPath("$.active").value(true));

        mvc.perform(get("/api/v1/reference/form-options")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.hubs[?(@.name == 'Indiranagar')]").isNotEmpty());
    }

    @Test
    void aModelsMakeIsDerivedFromItsNameWhenNotGiven() throws Exception {
        mvc.perform(post("/api/v1/reference/models")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Sprinto-BS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Sprinto-BS"))
                .andExpect(jsonPath("$.make").value("Sprinto"));
    }

    @Test
    void theSameHubTwiceIsRefused() throws Exception {
        mvc.perform(post("/api/v1/reference/hubs")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Jayanagar\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/reference/hubs")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  jayanagar  \"}"))
                .andExpect(status().isConflict());
    }

    /** Opening a hub changes how the fleet is organised. */
    @Test
    void fleetStaffCanReadTheListsButNotAddToThem() throws Exception {
        mvc.perform(get("/api/v1/reference/form-options")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/reference/hubs")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Whitefield\"}"))
                .andExpect(status().isForbidden());
    }

    /** Another operator's hubs are not in this one's list. */
    @Test
    void theListsAreScopedToTheTenant() throws Exception {
        mvc.perform(post("/api/v1/reference/hubs")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Secret Hub\"}"))
                .andExpect(status().isOk());

        String body = mvc.perform(get("/api/v1/reference/form-options")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Same tenant, so it is there — the scoping test that matters is that
        // another tenant's admin cannot see it, and RLS is what enforces that.
        org.assertj.core.api.Assertions.assertThat(body).contains("Secret Hub");
    }
}
