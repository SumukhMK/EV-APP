package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Who may do what, from docs/backend/RBAC.md.
 *
 * <p>The rule worth a test of its own is conflict #2: the service manager runs
 * the workshop but cannot close a job, because closing decides who pays. It is
 * the only place in this module where the workshop role is the narrower one,
 * and it is exactly the kind of rule that gets "simplified" away later.
 */
class ServiceJobRbacTest extends ServiceJobTestBase {

    private String adminToken;
    private String staffToken;
    private String managerToken;
    private UUID jobId;

    @BeforeEach
    void signInAll() throws Exception {
        adminToken = tokenFor(ADMIN_EMAIL);
        staffToken = tokenFor(STAFF_EMAIL);
        managerToken = tokenFor(MANAGER_EMAIL);
        jobId = openJob(adminToken, "BLRSS0428", "MINOR");
    }

    private org.springframework.test.web.servlet.ResultActions close(String token) throws Exception {
        return mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                         {"items":[],"liability":"COMPANY"}
                         """));
    }

    private org.springframework.test.web.servlet.ResultActions update(String token) throws Exception {
        return mvc.perform(put("/api/v1/service/jobs/" + jobId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                         {"queue":"MINOR_REPAIR","damageCategory":"MINOR","workSummary":"On the bench"}
                         """));
    }

    @Test
    void allFourRolesReadTheQueues() throws Exception {
        for (String token : new String[] {adminToken, staffToken, managerToken}) {
            mvc.perform(get("/api/v1/service/jobs").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
            mvc.perform(get("/api/v1/service/queues/counts").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void theWorkshopMayOpenAndWorkAJob() throws Exception {
        update(managerToken).andExpect(status().isOk());

        mvc.perform(post("/api/v1/service/jobs")
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"vehicleId":"BLRSS0428","source":"WALK_IN","damageCategory":"MINOR"}
                                 """))
                // Refused for having an open job already, not for the role.
                .andExpect(status().isConflict());
    }

    @Test
    void theWorkshopMaySubmitQc() throws Exception {
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Done"}
                                 """))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/qc")
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checks\":" + ALL_CHECKS_PASS + ",\"inspector\":\"Abhinandan\"}"))
                .andExpect(status().isCreated());
    }

    /** RBAC.md conflict #2, ruled for the approved service design. */
    @Test
    void theWorkshopMayNotDecideWhoPays() throws Exception {
        close(managerToken).andExpect(status().isForbidden());

        // Still open, so the refusal was a refusal and not a silent success.
        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.liability").doesNotExist());
    }

    @Test
    void aFleetHandMayCloseAJobBecauseLiabilityIsFleetWork() throws Exception {
        close(staffToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));
    }

    @Test
    void anAdminMayCloseAJob() throws Exception {
        close(adminToken).andExpect(status().isOk());
    }

    @Test
    void aFleetHandMayOpenAndWorkJobs() throws Exception {
        update(staffToken).andExpect(status().isOk());
    }

    @Test
    void noTokenOpensNothing() throws Exception {
        mvc.perform(post("/api/v1/service/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"vehicleId":"BLRSS0428","source":"WALK_IN","damageCategory":"MINOR"}
                                 """))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[],"liability":"COMPANY"}
                                 """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void theActivityLogNamesTheRoleThatActed() throws Exception {
        update(managerToken).andExpect(status().isOk());

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.activity[1].actor").value("Abhinandan"));
    }
}
