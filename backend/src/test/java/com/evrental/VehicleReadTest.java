package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import com.evrental.vehicle.VehicleTransitions;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class VehicleReadTest extends VehicleTestBase {

    @Autowired
    VehicleTransitions transitions;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void seedData() {
        UUID vehicleId = insertVehicle("BLRSS0700", "CH-700", VehicleState.READY_TO_DEPLOY);
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.DEPLOYED, null, adminUserId, "Meenakshi Iyer"));
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.RETURNED, null, adminUserId, "Meenakshi Iyer"));
        insertVehicle("BLRSS0701", "CH-701", VehicleState.DEPLOYED);
        insertVehicle("BLRSS0702", "CH-702", VehicleState.INDUCTED);
        insertVehicle("BLRSS0703", "CH-703", VehicleState.INDUCTED);
        insertVehicle("BLRSS0704", "CH-704", VehicleState.DEPLOYED);
        insertVehicle("BLRSS0705", "CH-705", VehicleState.DEPLOYED);
    }

    @Test
    void getByRegistryIdReturnsTheDetailWithItsLifecycle() throws Exception {
        mvc.perform(get("/api/v1/vehicles/BLRSS0700").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycle.length()").value(2))
                .andExpect(jsonPath("$.lifecycle[0].state").value("DEPLOYED"));
    }

    @Test
    void getIsCaseInsensitiveOnTheRegistryId() throws Exception {
        mvc.perform(get("/api/v1/vehicles/blrss0700").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("BLRSS0700"));
    }

    @Test
    void anotherTenantsVehicleIs404() throws Exception {
        insertVehicle(OTHER_TENANT, "BLRSS0799", "CH-799", VehicleState.INDUCTED);

        mvc.perform(get("/api/v1/vehicles/BLRSS0799").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void anUnknownRegistryIdIs404() throws Exception {
        mvc.perform(get("/api/v1/vehicles/UNKNOWN").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void theListPaginates() throws Exception {
        for (int i = 0; i < 9; i++) {
            insertVehicle("BLRSS07X" + i, "CH-70X" + i, VehicleState.INDUCTED);
        }

        mvc.perform(get("/api/v1/vehicles?page=1&size=12")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(3))
                .andExpect(jsonPath("$.totalElements").value(15));
    }

    @Test
    void theListFiltersByState() throws Exception {
        mvc.perform(get("/api/v1/vehicles?state=DEPLOYED")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].state").value("DEPLOYED"));
    }

    @Test
    void theSearchMatchesTheHub() throws Exception {
        // Every seeded bike is at Koramangala, so the hub search returns all six.
        mvc.perform(get("/api/v1/vehicles?q=koramangala")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(6));
    }

    @Test
    void theSearchMatchesTheRegistryIdAndChassis() throws Exception {
        mvc.perform(get("/api/v1/vehicles?q=CH-700")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1));

        mvc.perform(get("/api/v1/vehicles?q=BLRSS0701")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1));
    }

    /**
     * The search box says "id, chassis, hub, model, rider", and the list
     * prints the current rider — so a rider's name or code must find the
     * bike they hold. It did not: the query matched the vehicle's own
     * columns only, and "Prakash" returned nothing while BLRSS0437 sat
     * there with Prakash Bhandari in its last column.
     */
    @Test
    void theSearchMatchesTheCurrentRidersNameAndCode() throws Exception {
        java.util.UUID bike = insertVehicle("BLRSS0790", "CH-790", VehicleState.DEPLOYED);
        java.util.UUID rider = superAdmin(jdbc -> jdbc.queryForObject("""
                INSERT INTO riders (tenant_id, rider_code, name, phone, status, kyc_status, plan_amount_paise,
                  deposit_held_paise, billing_day, payment_day, payment_mode, platform, onboarded_on,
                  aadhaar_encrypted)
                VALUES (?, 'R77', 'Prakash Bhandari', '9611300077', 'ACTIVE', 'VERIFIED', 175000, 300000,
                  'MONDAY', 'MONDAY', 'UPI', 'Dunzo', CURRENT_DATE - 30, 'ciphertext')
                RETURNING id
                """, java.util.UUID.class, TENANT));
        superAdmin(jdbc -> jdbc.update(
                "INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on) VALUES (?, ?, ?, CURRENT_DATE - 30)",
                TENANT, rider, bike));

        for (String q : java.util.List.of("prakash", "Bhandari", "r77")) {
            mvc.perform(get("/api/v1/vehicles?q=" + q)
                            .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1))
                    .andExpect(jsonPath("$.content[0].id").value("BLRSS0790"));
        }
        // Facets count over the same search, so the chips agree with the rows.
        mvc.perform(get("/api/v1/vehicles/facets?q=prakash")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.value == 'ALL')].count").value(1));
    }

    @Test
    void facetsCountOverTheSearchNotTheStateFilter() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/vehicles/facets?state=DEPLOYED")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode facets = objectMapper.readTree(result.getResponse().getContentAsString());
        long inductedCount = findFacetCount(facets, "INDUCTED");
        assertThat(inductedCount).isEqualTo(2);
    }

    @Test
    void facetsIncludeAnAllChipWithTheTotal() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/vehicles/facets")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode facets = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(facets.get(0).get("value").asString()).isEqualTo("ALL");
        assertThat(facets.get(0).get("count").asInt()).isEqualTo(6);
    }

    @Test
    void filterOptionsListEachMakeAndBatteryTypeOnce() throws Exception {
        mvc.perform(get("/api/v1/vehicles/filter-options")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.makes.length()").value(1))
                .andExpect(jsonPath("$.batteryTypes.length()").value(1));
    }

    private long findFacetCount(JsonNode facets, String value) {
        for (JsonNode facet : facets) {
            if (value.equals(facet.get("value").asString())) {
                return facet.get("count").asLong();
            }
        }
        return -1;
    }
}
