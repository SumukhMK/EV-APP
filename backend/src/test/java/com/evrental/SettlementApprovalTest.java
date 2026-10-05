package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * A deboard's money facts become ledger entries when a Fleet Admin says so.
 *
 * <p>S5 writes outstanding rent and the deposit refund onto the closing
 * assignment row and deliberately stops there — whether they are real is a
 * Fleet Admin's decision, not an operator's. That decision had nowhere to be
 * recorded, so the figures sat unspent and the ledger said nothing about any
 * settlement that had ever happened.
 */
class SettlementApprovalTest extends AssignmentTestBase {

    private void assign(UUID riderId, String vehicleId) throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(riderCode(riderId), vehicleId)))
                .andExpect(status().isOk());
    }

    private void deboard(UUID riderId, String vehicleId, long rent, long refund) throws Exception {
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-29",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":%d,"depositRefund":%d,
                                 "damageItems":[]}
                                """.formatted(riderCode(riderId), vehicleId, rent, refund)))
                .andExpect(status().isOk());
    }

    private String pendingId() throws Exception {
        String body = mvc.perform(get("/api/v1/assignments/settlements")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$[0].assignmentId");
    }

    @Test
    void aDeboardWithMoneyWaitsForApproval() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY, 120000L, 300000L);

        mvc.perform(get("/api/v1/assignments/settlements")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].riderName").value("Anil Shetty"))
                .andExpect(jsonPath("$[0].vehicleId").value(VEHICLE_READY))
                .andExpect(jsonPath("$[0].outstandingRent").value(120000))
                .andExpect(jsonPath("$[0].depositRefund").value(300000))
                .andExpect(jsonPath("$[0].approvedOn").doesNotExist());
    }

    /** Rent owed becomes a charge; the refund draws the deposit down. */
    @Test
    void approvingWritesBothFactsToTheLedger() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY, 120000L, 300000L);

        mvc.perform(post("/api/v1/assignments/settlements/" + pendingId() + "/approve")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approvedBy").value("Meenakshi Iyer"))
                .andExpect(jsonPath("$.approvedOn").isNotEmpty());

        Integer charges = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM rider_charges
                 WHERE rider_id = ? AND amount_paise = 120000 AND liability = 'RIDER'
                   AND service_job_id IS NULL
                """, Integer.class, RIDER_A));
        Long deposit = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT deposit_held_paise FROM riders WHERE id = ?", Long.class, RIDER_A));

        org.assertj.core.api.Assertions.assertThat(charges).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(deposit).isZero();
    }

    /** Approving twice would raise a second charge for the same rent. */
    @Test
    void approvingTwiceIsRefused() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY, 120000L, 0L);
        String id = pendingId();

        mvc.perform(post("/api/v1/assignments/settlements/" + id + "/approve")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/assignments/settlements/" + id + "/approve")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isConflict());

        Integer charges = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM rider_charges WHERE rider_id = ? AND amount_paise = 120000",
                Integer.class, RIDER_A));
        org.assertj.core.api.Assertions.assertThat(charges).isEqualTo(1);
    }

    /** An approved settlement leaves the queue. */
    @Test
    void anApprovedSettlementIsNoLongerPending() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY, 50000L, 0L);

        mvc.perform(post("/api/v1/assignments/settlements/" + pendingId() + "/approve")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assignments/settlements")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** A deboard with no money owed and nothing to refund is not a queue item. */
    @Test
    void aDeboardWithNoMoneyNeverEntersTheQueue() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY, 0L, 0L);

        mvc.perform(get("/api/v1/assignments/settlements")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Approving moves money, so it is not a counter task. */
    @Test
    void fleetStaffCannotApproveASettlement() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        deboard(RIDER_A, VEHICLE_READY, 50000L, 0L);

        mvc.perform(get("/api/v1/assignments/settlements")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isForbidden());
    }

    /** A refund larger than the balance floors at zero rather than going negative. */
    @Test
    void aRefundLargerThanTheBalanceDoesNotGoNegative() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        Long before = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT deposit_held_paise FROM riders WHERE id = ?", Long.class, RIDER_A));

        // Refunding more than is held is a typo, not a settlement: it is
        // refused at the desk rather than clamped to zero on approval.
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-29",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":999999999,
                                 "damageItems":[]}
                                """.formatted(riderCode(RIDER_A), VEHICLE_READY)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("depositRefund"))
                .andExpect(jsonPath("$.message").value("Deposit refund cannot be more than the deposit held"));

        Long after = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT deposit_held_paise FROM riders WHERE id = ?", Long.class, RIDER_A));
        org.assertj.core.api.Assertions.assertThat(after).isEqualTo(before);
        mvc.perform(get("/api/v1/assignments/settlements")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
