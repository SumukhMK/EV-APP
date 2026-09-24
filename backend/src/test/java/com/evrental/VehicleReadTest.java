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
        mvc.perform(get("/api/v1/vehicles?q=koramangala")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(7));
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
        assertThat(facets.get(0).get("value").asText()).isEqualTo("ALL");
        assertThat(facets.get(0).get("count").asInt()).isEqualTo(7);
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
            if (value.equals(facet.get("value").asText())) {
                return facet.get("count").asLong();
            }
        }
        return -1;
    }
}
