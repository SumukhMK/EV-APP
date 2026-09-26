package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

/**
 * Reading the register: list, search, facets, detail, and the two lists the
 * assignment screen will consume.
 *
 * <p>The seeded fixture is one rider on TENANT's register (Anil Shetty,
 * 9845012277, Zomato, ACTIVE) and one on OTHER_TENANT's that TENANT's callers
 * must never see.
 */
class RiderReadTest extends RiderTestBase {

    @Test
    void listsTheRegistersRiders() throws Exception {
        mvc.perform(get("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].name").value("Anil Shetty"))
                .andExpect(jsonPath("$.content[0].phone").value("9845012277"))
                .andExpect(jsonPath("$.content[0].currentVehicleId").doesNotExist())
                .andExpect(jsonPath("$.content[0].paymentStatus").value("PENDING"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void searchMatchesNamePhoneAndPlatform() throws Exception {
        // Name.
        mvc.perform(get("/api/v1/riders").param("q", "anil")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(1));
        // Phone.
        mvc.perform(get("/api/v1/riders").param("q", "9845012277")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(1));
        // Platform.
        mvc.perform(get("/api/v1/riders").param("q", "zomato")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(1));
        // Nothing matches.
        mvc.perform(get("/api/v1/riders").param("q", "nobody-here")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void statusAndPlatformFiltersWork() throws Exception {
        mvc.perform(get("/api/v1/riders").param("status", "ACTIVE")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/riders").param("status", "SUSPENDED")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/v1/riders").param("platform", "Zomato")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/riders").param("platform", "Swiggy")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void aVehicleStateFilterMatchesNothingUntilS5() throws Exception {
        // No rider holds a bike until S5 owns assignments, so any concrete
        // state matches nothing — an empty page, not an error and not a
        // silently ignored filter.
        mvc.perform(get("/api/v1/riders").param("vehicleState", "DEPLOYED")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void facetsCountOverTheSearchNotTheStatusFilter() throws Exception {
        // The chip row is counted over the search, never over the status
        // filter — filtering to ACTIVE must not zero every other chip.
        mvc.perform(get("/api/v1/riders/facets")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].value").value("ALL"))
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[?(@.value == 'ACTIVE')].count").value(1));
    }

    @Test
    void paginationIsHonoured() throws Exception {
        mvc.perform(get("/api/v1/riders").param("size", "1")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    @Test
    void getsARiderById() throws Exception {
        mvc.perform(get("/api/v1/riders/" + RIDER_A)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(RIDER_A.toString()))
                .andExpect(jsonPath("$.name").value("Anil Shetty"));
    }

    @Test
    void anUnknownRiderIsA404() throws Exception {
        mvc.perform(get("/api/v1/riders/" + java.util.UUID.randomUUID())
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void anotherTenantsRiderIsA404NotALeak() throws Exception {
        // RLS hides RIDER_B from TENANT's callers, so the read must 404
        // rather than answer with another operator's rider.
        mvc.perform(get("/api/v1/riders/" + RIDER_B)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void assignableIsTheActiveRegister() throws Exception {
        mvc.perform(get("/api/v1/riders/assignable")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(RIDER_A.toString()));
    }

    @Test
    void assignedIsEmptyUntilS5() throws Exception {
        mvc.perform(get("/api/v1/riders/assigned")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void thePaymentHistorySeamReturnsAnEmptyList() throws Exception {
        mvc.perform(get("/api/v1/payments/riders/" + RIDER_A + "/periods")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void thePaymentHistorySeam404sAnUnknownRider() throws Exception {
        mvc.perform(get("/api/v1/payments/riders/" + java.util.UUID.randomUUID() + "/periods")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }
}