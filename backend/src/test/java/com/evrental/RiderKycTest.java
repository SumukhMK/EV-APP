package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * KYC can be decided.
 *
 * <p>It could not. {@code kycStatus} was written once at onboarding, as
 * PENDING, and that was the only line in the codebase that ever wrote it. So
 * every rider in the register read "KYC pending" for ever, on three screens —
 * a verification state nobody could reach, which looks like a queue somebody
 * is working through.
 */
class RiderKycTest extends RiderTestBase {

    private String decision(String value) {
        return "{\"decision\":\"" + value + "\"}";
    }

    @Test
    void aRidersDocumentsCanBeVerified() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/kyc")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("VERIFIED")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kycStatus").value("VERIFIED"));

        mvc.perform(get("/api/v1/riders/" + RIDER_A_CODE)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.kycStatus").value("VERIFIED"));
    }

    /** Rejecting records a decision; it does not remove the rider. */
    @Test
    void aRidersDocumentsCanBeRejectedWithoutRemovingThem() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/kyc")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("REJECTED")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kycStatus").value("REJECTED"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    /** A decision can be revised — documents get resubmitted. */
    @Test
    void aDecisionCanBeChanged() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/kyc")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("REJECTED")))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/kyc")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("VERIFIED")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kycStatus").value("VERIFIED"));
    }

    /** Pending is where a rider starts, not an outcome to record. */
    @Test
    void pendingIsNotADecision() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/kyc")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("PENDING")))
                .andExpect(status().isUnprocessableEntity());
    }

    /** Judging someone's documents is not a counter task. */
    @Test
    void fleetStaffCannotDecideKyc() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A_CODE + "/kyc")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(decision("VERIFIED")))
                .andExpect(status().isForbidden());
    }
}
