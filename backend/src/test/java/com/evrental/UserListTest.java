package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class UserListTest extends UserTestBase {

    @Test
    void listsTheCallersTenantSortedByName() throws Exception {
        mvc.perform(get("/api/v1/users").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                // Five accounts in TENANT: admin, staff, service manager,
                // invited, second admin.
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.content[0].name").value("Abhinandan"))
                .andExpect(jsonPath("$.content[1].name").value("Dhananjay"))
                .andExpect(jsonPath("$.content[2].name").value("Meenakshi Iyer"))
                .andExpect(jsonPath("$.content[3].name").value("Ravi Shastri"))
                .andExpect(jsonPath("$.content[4].name").value("Sana Qureshi"));
    }

    @Test
    void paginates() throws Exception {
        mvc.perform(get("/api/v1/users").param("page", "0").param("size", "2")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalPages").value(3));
    }

    @Test
    void neverSeesAnotherTenantsUsers() throws Exception {
        mvc.perform(get("/api/v1/users").header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(5));

        mvc.perform(get("/api/v1/users").header("Authorization", "Bearer " + tokenFor(OTHER_FLEET_ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].email").value(OTHER_FLEET_ADMIN_EMAIL));
    }

    @Test
    void aSuperAdminSeesOnlyThePlatformTenant() throws Exception {
        mvc.perform(get("/api/v1/users").header("Authorization", "Bearer " + tokenFor(SUPER_ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }
}