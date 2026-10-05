package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class VehicleCreateTest extends VehicleTestBase {

    private static final String BODY = """
            {"id":"BLRSS0600","chassisNumber":"SESEAG03202300600","model":"Eagle 2",
             "batteryType":"Yuma","batteryVendor":"Yuma","hub":"Koramangala",
             "registrationNumber":"KA01AB1234","inductedOn":"2026-09-01"}
            """;

    @Test
    void createsTheVehicleInductedWithAMakeDerivedFromTheModel() throws Exception {
        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("BLRSS0600"))
                .andExpect(jsonPath("$.state").value("INDUCTED"))
                .andExpect(jsonPath("$.hub").value("Koramangala"))
                // deriveMake: "Eagle*" is e-Connects, everything else e-Sprinto.
                .andExpect(jsonPath("$.currentRiderId").doesNotExist());
    }

    @Test
    void inductionIsItselfALoggedTransition() throws Exception {
        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated());

        Integer events = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicle_lifecycle_events e JOIN vehicles v ON v.id = e.vehicle_id "
                        + "WHERE v.registry_id = 'BLRSS0600' AND e.from_state IS NULL "
                        + "AND e.to_state = 'INDUCTED'", Integer.class));
        assertThat(events).isEqualTo(1);
    }

    @Test
    void aDuplicateRegistryIdIs409OnTheIdField() throws Exception {
        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated());

        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("SESEAG03202300600", "SESEAG03202300601")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("id"));
    }

    /**
     * A chassis number is a 17-character VIN, and every bike in the fleet has
     * one. The form said so and refused anything else; the API accepted
     * anything up to 40 characters, so a short one typed into a spreadsheet
     * or sent directly was stored. The rule lives here now.
     */
    @Test
    void aChassisThatIsNotSeventeenLettersAndDigitsIs422OnTheChassisField() throws Exception {
        for (String bad : java.util.List.of("SHORT123", "SESEAG-0320230-99", "SESEAG032023004021")) {
            mvc.perform(post("/api/v1/vehicles")
                            .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"id":"BLRSS0699","chassisNumber":"%s","model":"Eagle 2",
                                     "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2026-09-01"}
                                    """.formatted(bad)))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(jsonPath("$.field").value("chassisNumber"))
                    .andExpect(jsonPath("$.message").value("Chassis number must be exactly 17 letters and digits"));
        }
    }

    /** The form only lets capitals through; the API stored whatever came. One spelling per bike. */
    @Test
    void aLowercaseRegistryIdIsStoredInCapitals() throws Exception {
        mvc.perform(post("/api/v1/vehicles")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id":"blrss0698","chassisNumber":"SESEAG03202300698","model":"Eagle 2",
                                 "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2026-09-01"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("BLRSS0698"));
    }

    /** The import refuses a future induction date; the single-add endpoint must too. */
    @Test
    void anInductionDateInTheFutureIs422OnTheDateField() throws Exception {
        mvc.perform(post("/api/v1/vehicles")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id":"BLRSS0697","chassisNumber":"SESEAG03202300697","model":"Eagle 2",
                                 "batteryType":"Yuma","hub":"Koramangala","inductedOn":"2031-01-01"}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("inductedOn"))
                .andExpect(jsonPath("$.message").value("Induction date cannot be in the future"));
    }

    @Test
    void aDuplicateChassisIs409OnTheChassisField() throws Exception {
        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated());

        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("BLRSS0600", "BLRSS0601")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("chassisNumber"));
    }

    @Test
    void theSameRegistryIdInAnotherTenantIsFine() throws Exception {
        insertVehicle(OTHER_TENANT, "BLRSS0600", "CH-OTHER", VehicleState.INDUCTED);

        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated());
    }

    @Test
    void aMissingRequiredFieldIs422WithTheField() throws Exception {
        mvc.perform(post("/api/v1/vehicles").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("\"BLRSS0600\"", "\"\"")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("id"));
    }
}
