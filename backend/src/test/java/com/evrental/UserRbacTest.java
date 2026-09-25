package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The account directory is admin-only: fleet staff and service managers
 * neither see it nor edit it. The 403 cases only pass because
 * GlobalExceptionHandler handles AccessDeniedException — without it a
 * method-security denial falls into the catch-all and returns 500.
 */
class UserRbacTest extends UserTestBase {

    @Test
    void fleetStaffCannotListUsers() throws Exception {
        mvc.perform(get("/api/v1/users").header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isForbidden());
    }

    @Test
    void serviceManagerCannotListUsers() throws Exception {
        mvc.perform(get("/api/v1/users").header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL)))
                .andExpect(status().isForbidden());
    }

    @Test
    void fleetStaffCannotEditUsers() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(STAFF_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Dhananjay","email":"users-staff@g1mobility.in",
                                 "role":"FLEET_STAFF","status":"ACTIVE"}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void aRequestWithNoTokenIs401() throws Exception {
        mvc.perform(get("/api/v1/users"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Not signed in"));
    }
}