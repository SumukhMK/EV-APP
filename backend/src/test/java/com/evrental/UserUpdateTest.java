package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class UserUpdateTest extends UserTestBase {

    private static final String BODY = """
            {"name":"Dhananjay","email":"users-staff@g1mobility.in",
             "role":"FLEET_STAFF","status":"ACTIVE"}
            """;

    @Test
    void updatesNameEmailRoleAndStatus() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(STAFF_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY
                                .replace("Dhananjay", "Dhananjay Kumar")
                                .replace("users-staff@g1mobility.in", "dhananjay.kumar@g1mobility.in")
                                .replace("\"role\":\"FLEET_STAFF\"", "\"role\":\"SERVICE_MANAGER\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Dhananjay Kumar"))
                .andExpect(jsonPath("$.email").value("dhananjay.kumar@g1mobility.in"))
                .andExpect(jsonPath("$.role").value("SERVICE_MANAGER"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void canEditYourOwnNameAndEmailButNotRoleOrStatus() throws Exception {
        // Captured once: the first PUT renames the account, so looking the id
        // up by the original email afterwards would find nothing. The token
        // stays valid — it carries the user id, not the email.
        UUID myId = userIdOf(ADMIN_EMAIL);
        String myToken = tokenFor(ADMIN_EMAIL);

        // Own name and email: fine.
        mvc.perform(put("/api/v1/users/" + myId)
                        .header("Authorization", "Bearer " + myToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Meenakshi Menon","email":"meenakshi.menon@g1mobility.in",
                                 "role":"FLEET_ADMIN","status":"ACTIVE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Meenakshi Menon"));

        // Own role: blocked.
        mvc.perform(put("/api/v1/users/" + myId)
                        .header("Authorization", "Bearer " + myToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Meenakshi Menon","email":"meenakshi.menon@g1mobility.in",
                                 "role":"FLEET_STAFF","status":"ACTIVE"}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("role"));

        // Own status: blocked.
        mvc.perform(put("/api/v1/users/" + myId)
                        .header("Authorization", "Bearer " + myToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Meenakshi Menon","email":"meenakshi.menon@g1mobility.in",
                                 "role":"FLEET_ADMIN","status":"DISABLED"}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("status"));
    }

    @Test
    void unknownIdIs404() throws Exception {
        mvc.perform(put("/api/v1/users/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());
    }

    @Test
    void aFleetAdminCannotEditAnotherTenantsUser() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(OTHER_FLEET_ADMIN_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());
    }

    @Test
    void duplicateEmailIs409OnTheEmailField() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(STAFF_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("users-staff@g1mobility.in", SECOND_ADMIN_EMAIL)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("email"));
    }

    @Test
    void aMissingRequiredFieldIs422WithTheField() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(STAFF_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("Dhananjay", "")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("name"));
    }

    @Test
    void activatingAPasswordlessInvitedUserIs422() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(INVITED_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Sana Qureshi","email":"users-invited@g1mobility.in",
                                 "role":"FLEET_STAFF","status":"ACTIVE"}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("status"));
    }

    @Test
    void fleetAdminCannotGrantSuperAdmin() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(STAFF_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("\"role\":\"FLEET_STAFF\"", "\"role\":\"SUPER_ADMIN\"")))
                .andExpect(status().isForbidden());
    }

    @Test
    void superAdminCanGrantSuperAdmin() throws Exception {
        mvc.perform(put("/api/v1/users/" + userIdOf(PLATFORM_USER_EMAIL))
                        .header("Authorization", "Bearer " + tokenFor(SUPER_ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Platform Ops","email":"users-platform@g1mobility.in",
                                 "role":"SUPER_ADMIN","status":"ACTIVE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("SUPER_ADMIN"));
    }
}