package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The register is SA/FA/FS work (RBAC.md, Riders section): fleet staff run it
 * day to day, and SERVICE_MANAGER never sees it. The 403 cases only pass
 * because GlobalExceptionHandler handles AccessDeniedException — without it a
 * method-security denial falls into the catch-all and returns 500.
 */
class RiderRbacTest extends RiderTestBase {

    @Test
    void fleetStaffCanRunTheRegister() throws Exception {
        String token = tokenFor(STAFF_EMAIL);

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/riders")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/riders/" + RIDER_A)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void serviceManagerCannotSeeTheRegister() throws Exception {
        String token = tokenFor(SERVICE_MANAGER_EMAIL);

        mvc.perform(get("/api/v1/riders")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/riders/facets")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/riders/assignable")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/riders/assigned")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/riders/" + RIDER_A)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/payments/riders/" + RIDER_A + "/periods")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void aRequestWithNoTokenIs401() throws Exception {
        mvc.perform(get("/api/v1/riders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Not signed in"));
    }
}