package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.common.ConflictException;
import com.evrental.payment.RiderCharge;
import com.evrental.payment.RiderChargeRepository;
import com.evrental.payment.RiderChargeService;
import com.evrental.payment.RiderChargeStatus;
import com.evrental.service.ServiceJobClosedEvent;
import com.evrental.service.ServiceLiability;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * The charge ledger, and the seam it hangs off.
 *
 * <p>The thing under test that matters most is not the arithmetic — it is that
 * a repair is billed exactly once. The charge is raised by an async listener,
 * and async delivery is the kind that gets repeated.
 */
class RiderChargeTest extends ServiceJobTestBase {

    @Autowired
    RiderChargeService chargeService;

    @Autowired
    RiderChargeRepository charges;

    private String token;
    private UUID jobId;
    private final UUID riderId = RIDER_ID;

    @BeforeEach
    void openPriceAndPass() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        jobId = openJob(token, "BLRSS0428", "MINOR", riderId);
        mvc.perform(put("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Panel replaced",
                                  "technician":"Raju","note":"Ready for checking",
                                  "items":[{"label":"Left panel","costPaise":85000,"kind":"PART"}]}
                                 """))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/qc")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"checks\":" + ALL_CHECKS_PASS + ",\"inspector\":\"Suresh\"}"))
                .andExpect(status().isCreated());
    }

    private void close(String liability) throws Exception {
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[{"label":"Left panel","costPaise":85000,"kind":"PART"}],
                                  "liability":"%s","technician":"Raju"}
                                 """.formatted(liability)))
                .andExpect(status().isOk());
    }

    /** Rows this tenant's charges, read past RLS so the test sees what really landed. */
    private List<UUID> chargeIdsForJob() {
        return superAdmin(jdbc -> jdbc.queryForList(
                "SELECT id FROM rider_charges WHERE service_job_id = ?", UUID.class, jobId));
    }

    @Test
    void closingAgainstTheRiderRaisesACharge() throws Exception {
        close("RIDER");

        // The listener is async: wait for the row rather than assuming it beat us.
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));

        RiderCharge charge = asTenant(() -> charges.findByServiceJobId(jobId).orElseThrow());
        assertThat(charge.getAmountPaise()).isEqualTo(85000);
        assertThat(charge.getRiderId()).isEqualTo(riderId);
        assertThat(charge.getLiability()).isEqualTo(ServiceLiability.RIDER);
        assertThat(charge.getStatus()).isEqualTo(RiderChargeStatus.OPEN);
        assertThat(charge.getTenantId()).isEqualTo(TENANT);
    }

    @Test
    void aDepositChargeIsRaisedToo() throws Exception {
        // It never appears on a weekly run, but the money is owed either way.
        close("DEPOSIT");

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));
        assertThat(asTenant(() -> charges.findByServiceJobId(jobId).orElseThrow()).getLiability())
                .isEqualTo(ServiceLiability.DEPOSIT);
    }

    @Test
    void theFleetAbsorbingItRaisesNothing() throws Exception {
        close("COMPANY");

        // Nothing to wait for, so give the pool a moment to prove it stays empty.
        Thread.sleep(1500);
        assertThat(chargeIdsForJob()).isEmpty();
    }

    /**
     * The failure this module must not have. An async listener is the kind
     * that gets redelivered; the unique index is what makes that harmless.
     */
    @Test
    void oneRepairIsBilledOnceHoweverOftenTheEventArrives() throws Exception {
        close("RIDER");
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));

        ServiceJobClosedEvent replay = new ServiceJobClosedEvent(
                TENANT, jobId, vehicleId, riderId, ServiceLiability.RIDER, 85000);
        chargeService.raiseFor(replay);
        chargeService.raiseFor(replay);

        assertThat(chargeIdsForJob()).hasSize(1);
    }

    @Test
    void aReplayReturnsTheChargeThatAlreadyExistsRatherThanNothing() throws Exception {
        close("RIDER");
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));
        UUID original = asTenant(() -> charges.findByServiceJobId(jobId).orElseThrow()).getId();

        RiderCharge again = chargeService.raiseFor(new ServiceJobClosedEvent(
                TENANT, jobId, vehicleId, riderId, ServiceLiability.RIDER, 85000));

        assertThat(again).isNotNull();
        assertThat(again.getId()).isEqualTo(original);
    }

    @Test
    void aFreeRepairIsNotADebt() {
        RiderCharge none = chargeService.raiseFor(new ServiceJobClosedEvent(
                TENANT, jobId, vehicleId, riderId, ServiceLiability.RIDER, 0));

        assertThat(none).isNull();
        assertThat(chargeIdsForJob()).isEmpty();
    }

    @Test
    void aJobWithNoRiderBillsNobody() {
        RiderCharge none = chargeService.raiseFor(new ServiceJobClosedEvent(
                TENANT, jobId, vehicleId, null, ServiceLiability.RIDER, 85000));

        assertThat(none).isNull();
        assertThat(chargeIdsForJob()).isEmpty();
    }

    @Test
    void theListenerSetsItsOwnTenantOrRowLevelSecurityWouldRefuseIt() throws Exception {
        // The listener runs off-request, so nothing has issued SET LOCAL
        // app.tenant_id for it. If it did not set its own, this insert would
        // be refused and no charge would ever appear.
        close("RIDER");

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));
    }

    @Test
    void settlingStampsTheDateAndCannotBeDoneTwice() throws Exception {
        close("RIDER");
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));
        UUID chargeId = chargeIdsForJob().get(0);

        mvc.perform(post("/api/v1/payments/charges/" + chargeId + "/settle")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SETTLED"))
                .andExpect(jsonPath("$.settledOn").exists());

        // Money rows are never edited: there is no unsettle, and settling a
        // settled charge is a mistake worth naming.
        assertThatThrownBy(() -> asTenant(() -> chargeService.settle(chargeId)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This charge is already settled");
    }

    @Test
    void theLedgerAddsUpWhatARiderStillOwes() throws Exception {
        close("RIDER");
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));

        mvc.perform(get("/api/v1/payments/charges/outstanding")
                        .header("Authorization", "Bearer " + token)
                        .param("riderId", riderId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outstandingPaise").value(85000));

        mvc.perform(post("/api/v1/payments/charges/" + chargeIdsForJob().get(0) + "/settle")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // Settled money is not owed money.
        mvc.perform(get("/api/v1/payments/charges/outstanding")
                        .header("Authorization", "Bearer " + token)
                        .param("riderId", riderId.toString()))
                .andExpect(jsonPath("$.outstandingPaise").value(0));
    }

    @Test
    void listsARidersChargesAndFiltersByStatus() throws Exception {
        close("RIDER");
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));

        mvc.perform(get("/api/v1/payments/charges")
                        .header("Authorization", "Bearer " + token)
                        .param("riderId", riderId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].amountPaise").value(85000))
                .andExpect(jsonPath("$[0].serviceJobId").value(jobId.toString()));

        mvc.perform(get("/api/v1/payments/charges")
                        .header("Authorization", "Bearer " + token)
                        .param("riderId", riderId.toString())
                        .param("status", "SETTLED"))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void theBooksAreAdminWork() throws Exception {
        close("RIDER");
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(chargeIdsForJob()).hasSize(1));

        // A workshop role can run a cost up; it must not be able to read the
        // fleet's books or write a debt off (RBAC.md, Money = SA/FA only).
        for (String email : new String[] {STAFF_EMAIL, MANAGER_EMAIL}) {
            String other = tokenFor(email);
            mvc.perform(get("/api/v1/payments/charges")
                            .header("Authorization", "Bearer " + other)
                            .param("riderId", riderId.toString()))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/payments/charges/" + chargeIdsForJob().get(0) + "/settle")
                            .header("Authorization", "Bearer " + other))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void noTokenReadsNothing() throws Exception {
        mvc.perform(get("/api/v1/payments/charges").param("riderId", riderId.toString()))
                .andExpect(status().isUnauthorized());
    }
}
