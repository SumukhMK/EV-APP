package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Taking money, and what it does to a week.
 *
 * <p>Collections are append-only and {@code amount_paid} is recomputed from
 * them rather than incremented. The test that matters most is the concurrent
 * one: two people at the same counter must not be able to lose a payment
 * between them.
 */
class PaymentCollectionTest extends PaymentRunTestBase {

    private String token;
    private LocalDate monday;

    @BeforeEach
    void logInAndGenerate() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        monday = currentPeriodStart(BillingDay.MONDAY);
        openTheRun();
    }

    private void openTheRun() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions pay(UUID riderId, long amount, String method)
            throws Exception {
        return mvc.perform(post("/api/v1/payments/collections")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                         {"riderId":"%s","amount":%d,"method":"%s"}
                         """.formatted(riderId, amount, method)));
    }

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    @Test
    void pendingBecomesPartialBecomesPaid() throws Exception {
        pay(CHARGED_RIDER, 75_000, "CASH")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountPaid").value(75_000))
                .andExpect(jsonPath("$.status").value("PARTIAL"));

        pay(CHARGED_RIDER, PLAIN_PLAN_PAISE - 75_000, "UPI")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountPaid").value(PLAIN_PLAN_PAISE))
                .andExpect(jsonPath("$.status").value("PAID"));
    }

    /**
     * Overpayment is accepted on purpose. The contract calls {@code balance}
     * "positive means still owed", which already anticipates a negative:
     * riders pay ahead, and refusing money at the counter is worse than
     * carrying a credit.
     */
    @Test
    void overpaymentIsAcceptedAndTheBalanceGoesNegative() throws Exception {
        pay(CHARGED_RIDER, PLAIN_PLAN_PAISE + 50_000, "UPI")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mvc.perform(get("/api/v1/payments/receipts/" + CHARGED_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.balance").value(-50_000));
    }

    /**
     * Two people recording cash at the same counter.
     *
     * <p>The period is locked for the length of each collection, and
     * {@code amount_paid} is a recomputed {@code SUM}, never
     * {@code amount_paid + ?}. With an increment one of these two payments
     * would land on a stale read and disappear.
     */
    @Test
    void twoConcurrentCollectionsBothLand() throws Exception {
        Callable<Integer> payFifty = () -> pay(CHARGED_RIDER, 50_000, "CASH")
                .andReturn().getResponse().getStatus();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> both = pool.invokeAll(List.of(payFifty, payFifty));
            for (Future<Integer> f : both) {
                assertThat(f.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        Long paid = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT amount_paid_paise FROM payment_periods WHERE rider_id = ? AND period_start = ?",
                Long.class, CHARGED_RIDER, monday));
        assertThat(paid).isEqualTo(100_000L);

        Long rows = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM payment_collections c JOIN payment_periods p ON p.id = c.period_id "
                        + "WHERE p.rider_id = ? AND p.period_start = ?",
                Long.class, CHARGED_RIDER, monday));
        assertThat(rows).isEqualTo(2L);
    }

    /** A receipt number is issued once and does not change on the second payment. */
    @Test
    void theReceiptNumberIsIssuedOnceAndNeverReissued() throws Exception {
        pay(CHARGED_RIDER, 50_000, "CASH").andExpect(status().isOk());
        String first = receiptNoOf(CHARGED_RIDER);
        assertThat(first).startsWith("RCPT-" + today().getYear() + "-");

        pay(CHARGED_RIDER, 50_000, "CASH").andExpect(status().isOk());
        assertThat(receiptNoOf(CHARGED_RIDER)).isEqualTo(first);
    }

    /** Nothing collected, nothing to prove. */
    @Test
    void anUntouchedPeriodHasNoReceiptNumber() throws Exception {
        mvc.perform(get("/api/v1/payments/receipts/" + CHARGED_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.receiptNo").doesNotExist())
                .andExpect(jsonPath("$.method").doesNotExist())
                .andExpect(jsonPath("$.paidOn").doesNotExist())
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    /**
     * Paying a week clears the charges folded into its total.
     *
     * <p>Not tidiness: an OPEN charge against a paid week would be picked up
     * again as arrears on the next run and billed a second time.
     */
    @Test
    void payingAWeekSettlesTheChargesItBilled() throws Exception {
        // A fresh rider so the run can be generated with the charge already on
        // the ledger -- the row is frozen, so the charge has to exist first.
        insertCharge(TENANT, MONDAY_RIDER, 40_000, "RIDER", "OPEN", monday.minusWeeks(1));
        superAdmin(jdbc -> jdbc.update(
                "DELETE FROM payment_periods WHERE rider_id = ?", MONDAY_RIDER));
        openTheRun();

        pay(MONDAY_RIDER, ROUNDING_PLAN_PAISE + 40_000, "UPI")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.arrears").value(40_000))
                .andExpect(jsonPath("$.status").value("PAID"));

        Long stillOpen = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM rider_charges WHERE rider_id = ? AND status = 'OPEN'",
                Long.class, MONDAY_RIDER));
        assertThat(stillOpen).isZero();
    }

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    @Test
    void zeroOrNegativeIs422NamingAmount() throws Exception {
        pay(CHARGED_RIDER, 0, "CASH")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("amount"));
        pay(CHARGED_RIDER, -100, "CASH")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("amount"));
    }

    @Test
    void anUnknownMethodIs422NamingMethod() throws Exception {
        pay(CHARGED_RIDER, 1_000, "CHEQUE")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("method"));
    }

    @Test
    void anUnknownRiderIs404() throws Exception {
        pay(UUID.randomUUID(), 1_000, "CASH").andExpect(status().isNotFound());
    }

    /** A rider on the other cycle has no line in the Monday period yet. */
    @Test
    void aPaymentAgainstARiderWithNoCurrentLineIs409() throws Exception {
        pay(WEDNESDAY_RIDER, 1_000, "CASH")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("riderId"));
    }

    /** Another tenant's rider is a 404, not a leak. */
    @Test
    void anotherTenantsRiderIs404() throws Exception {
        pay(RIVAL_RIDER, 1_000, "CASH").andExpect(status().isNotFound());

        mvc.perform(get("/api/v1/payments/receipts/" + RIVAL_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    // -----------------------------------------------------------------------
    // Receipts
    // -----------------------------------------------------------------------

    /**
     * The invariant, from the other side: a receipt restates the run row, it
     * does not recompute it.
     */
    @Test
    void aReceiptRestatesItsRunRowExactly() throws Exception {
        insertCharge(TENANT, CHARGED_RIDER, 25_000, "RIDER", "OPEN", monday.minusWeeks(1));
        superAdmin(jdbc -> jdbc.update("DELETE FROM payment_periods WHERE rider_id = ?", CHARGED_RIDER));
        openTheRun();

        String run = mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString();
        var row = new tools.jackson.databind.ObjectMapper().readTree(run).get("rows").get(1);

        mvc.perform(get("/api/v1/payments/receipts/" + CHARGED_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.billedAmount").value(row.get("billedAmount").asLong()))
                .andExpect(jsonPath("$.serviceCharges").value(row.get("serviceCharges").asLong()))
                .andExpect(jsonPath("$.arrears").value(row.get("arrears").asLong()))
                .andExpect(jsonPath("$.totalDue").value(row.get("totalDue").asLong()))
                .andExpect(jsonPath("$.periodStart").value(monday.toString()))
                .andExpect(jsonPath("$.billingDay").value("MONDAY"));
    }

    /**
     * No line in this period is 200 with a JSON null, not a 404.
     *
     * <p>"No such rider" and "this rider is not billed this week" are
     * different answers and the screen renders them differently. The body is a
     * literal {@code null} rather than empty, so {@code res.json()} resolves
     * instead of throwing.
     */
    @Test
    void aRiderWithNoLineInThisPeriodIs200Null() throws Exception {
        mvc.perform(get("/api/v1/payments/receipts/" + WEDNESDAY_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string("null"));
    }

    @Test
    void anUnknownRiderOnTheReceiptEndpointIs404() throws Exception {
        mvc.perform(get("/api/v1/payments/receipts/" + UUID.randomUUID())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void theReceiptCarriesTheMostRecentCollection() throws Exception {
        pay(CHARGED_RIDER, 20_000, "CASH").andExpect(status().isOk());
        pay(CHARGED_RIDER, 30_000, "UPI").andExpect(status().isOk());

        mvc.perform(get("/api/v1/payments/receipts/" + CHARGED_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.method").value("UPI"))
                .andExpect(jsonPath("$.amountPaid").value(50_000))
                .andExpect(jsonPath("$.paidOn").exists());
    }

    // -----------------------------------------------------------------------
    // Overdue
    // -----------------------------------------------------------------------

    /**
     * A week that closed while still short is overdue, whether nothing came in
     * or only half did. Nothing writes to the row between generation and the
     * day it goes late — there is no scheduler — so the list reads the numbers
     * rather than the stored status.
     */
    @Test
    void aClosedWeekStillShortReadsOverdue() throws Exception {
        // Anchored on today, not on this week's Monday, so the day counts are
        // the same whichever day the suite runs: a week that ended 22 days ago
        // is 22 days overdue on a Tuesday and on a Sunday alike. Anchoring on
        // Monday would slide the counts across a stage boundary mid-week.
        insertPeriod(TENANT, MONDAY_RIDER, today().minusDays(28), BillingDay.MONDAY,
                PLAIN_PLAN_PAISE, 0, "PENDING");
        insertPeriod(TENANT, CHARGED_RIDER, today().minusDays(21), BillingDay.MONDAY,
                PLAIN_PLAN_PAISE, 75_000, "PARTIAL");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // Worst first: three weeks behind before two.
                .andExpect(jsonPath("$[0].riderId").value(MONDAY_RIDER.toString()))
                .andExpect(jsonPath("$[0].amountDue").value(PLAIN_PLAN_PAISE))
                .andExpect(jsonPath("$[0].daysOverdue").value(22))
                .andExpect(jsonPath("$[0].stage").value("REPOSSESSION_DUE"))
                .andExpect(jsonPath("$[0].phone").value("9845010001"))
                .andExpect(jsonPath("$[1].riderId").value(CHARGED_RIDER.toString()))
                .andExpect(jsonPath("$[1].amountDue").value(PLAIN_PLAN_PAISE - 75_000))
                .andExpect(jsonPath("$[1].daysOverdue").value(15))
                .andExpect(jsonPath("$[1].stage").value("WARNING_2"));
    }

    /** The current week is not overdue, however little has been paid against it. */
    @Test
    void thisWeekIsNeverOverdue() throws Exception {
        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** A settled old week drops off the list. */
    @Test
    void aSettledOldWeekIsNotOverdue() throws Exception {
        insertPeriod(TENANT, MONDAY_RIDER, monday.minusWeeks(3), BillingDay.MONDAY,
                PLAIN_PLAN_PAISE, PLAIN_PLAN_PAISE, "PAID");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    // -----------------------------------------------------------------------
    // The rider profile's history panel
    // -----------------------------------------------------------------------

    @Test
    void theHistoryPanelListsTheRidersWeeksNewestFirst() throws Exception {
        insertPeriod(TENANT, CHARGED_RIDER, monday.minusWeeks(1), BillingDay.MONDAY,
                PLAIN_PLAN_PAISE, PLAIN_PLAN_PAISE, "PAID");
        pay(CHARGED_RIDER, 60_000, "BANK_TRANSFER").andExpect(status().isOk());

        mvc.perform(get("/api/v1/payments/riders/" + CHARGED_RIDER + "/periods")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].periodStart").value(monday.toString()))
                .andExpect(jsonPath("$[0].status").value("PARTIAL"))
                .andExpect(jsonPath("$[0].method").value("BANK_TRANSFER"))
                .andExpect(jsonPath("$[1].periodStart").value(monday.minusWeeks(1).toString()))
                .andExpect(jsonPath("$[1].method").doesNotExist());
    }

    @Test
    void theHistoryPanelIs404ForAnUnknownRider() throws Exception {
        mvc.perform(get("/api/v1/payments/riders/" + UUID.randomUUID() + "/periods")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    private String receiptNoOf(UUID riderId) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT receipt_no FROM payment_periods WHERE rider_id = ? AND period_start = ?",
                String.class, riderId, monday));
    }
}
