package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The money flows end to end: one number per rider, one row per payment,
 * reversals, and the end-of-day count.
 */
class CollectionsTest extends PaymentRunTestBase {

    private static final ObjectMapper JSON = new ObjectMapper();

    private String admin;

    @BeforeEach
    void logIn() throws Exception {
        admin = tokenFor(ADMIN_EMAIL);
    }

    private JsonNode getJson(String url, String token) throws Exception {
        return JSON.readTree(mvc.perform(get(url).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode account(String code) throws Exception {
        return getJson("/api/v1/payments/riders/" + code + "/account", admin);
    }

    private long owes(String code) throws Exception {
        return account(code).get("owes").asLong();
    }

    private JsonNode pay(String code, long paise, String method, String key) throws Exception {
        return JSON.readTree(tryPay(code, paise, method, key)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.ResultActions tryPay(String code, long paise, String method, String key)
            throws Exception {
        String body = "{\"riderId\":\"" + code + "\",\"amount\":" + paise + ",\"method\":\"" + method + "\""
                + (key == null ? "" : ",\"clientKey\":\"" + key + "\"") + "}";
        return mvc.perform(post("/api/v1/payments/collections")
                .header("Authorization", "Bearer " + admin)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private org.springframework.test.web.servlet.ResultActions reverse(String id, String reason, String token)
            throws Exception {
        return mvc.perform(post("/api/v1/payments/collections/" + id + "/reverse")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"" + reason + "\"}"));
    }

    private int paymentRows(UUID riderId) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM payment_collections WHERE rider_id = ?", Integer.class, riderId));
    }

    /** The last two closed weeks, both unpaid. */
    private LocalDate twoLateWeeks() {
        LocalDate start = currentPeriodStart(BillingDay.MONDAY);
        insertPaidPeriod(TENANT, MONDAY_RIDER, start.minusWeeks(2), BillingDay.MONDAY, ROUNDING_PLAN_PAISE, 0);
        insertPaidPeriod(TENANT, MONDAY_RIDER, start.minusWeeks(1), BillingDay.MONDAY, ROUNDING_PLAN_PAISE, 0);
        return start;
    }

    // -----------------------------------------------------------------------
    // One payment, one row
    // -----------------------------------------------------------------------

    @Test
    void aPartPaymentIsOneRowAndTheRestStaysOwed() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        assertThat(before).isPositive();

        JsonNode payment = pay(MONDAY_RIDER_CODE, 10_000, "UPI", null);

        assertThat(payment.get("owedBefore").asLong()).isEqualTo(before);
        assertThat(payment.get("owedAfter").asLong()).isEqualTo(before - 10_000);
        assertThat(payment.get("receiptNo").asString()).matches("RCPT-\\d{4}-\\d{6}");
        assertThat(payment.get("by").asString()).isEqualTo("Meenakshi Iyer");
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(before - 10_000);
        assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(1);
    }

    /** ₹10,000 against ₹11,400 owed reads ₹10,000 paid everywhere — never a slice of it. */
    @Test
    void aPaymentCoveringOldWeeksStillShowsInFullOnTheList() throws Exception {
        twoLateWeeks();
        long before = owes(MONDAY_RIDER_CODE);
        pay(MONDAY_RIDER_CODE, before - 5_000, "UPI", null);

        mvc.perform(get("/api/v1/payments/collections").header("Authorization", "Bearer " + admin))
                .andExpect(jsonPath("$.rows[?(@.riderId == 'R01')].owes").value(5_000))
                .andExpect(jsonPath("$.rows[?(@.riderId == 'R01')].lastPayment.amount").value((int) (before - 5_000)))
                .andExpect(jsonPath("$.collectedToday").value((int) (before - 5_000)))
                .andExpect(jsonPath("$.paymentsToday").value(1));
    }

    // -----------------------------------------------------------------------
    // No advance payments: never more than is owed
    // -----------------------------------------------------------------------

    @Test
    void payingMoreThanIsOwedIsRefusedAndNothingIsSaved() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        assertThat(before).isPositive();

        // A paise amount is refused for that alone: money is whole rupees.
        tryPay(MONDAY_RIDER_CODE, 1_050, "CASH", null)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("amount"))
                .andExpect(jsonPath("$.details.code").value("INVALID_PAYMENT_AMOUNT"));

        tryPay(MONDAY_RIDER_CODE, before + 100, "CASH", null)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("amount"))
                .andExpect(jsonPath("$.details.code").value("PAYMENT_EXCEEDS_DUES"))
                .andExpect(jsonPath("$.details.owes").value(before));

        assertThat(paymentRows(MONDAY_RIDER)).isZero();
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(before);
    }

    @Test
    void payingExactlyWhatIsOwedClearsItAndThenNothingMoreCanBePaid() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        JsonNode payment = pay(MONDAY_RIDER_CODE, before, "UPI", null);

        assertThat(payment.get("owedAfter").asLong()).isZero();
        assertThat(owes(MONDAY_RIDER_CODE)).isZero();
        tryPay(MONDAY_RIDER_CODE, 100, "UPI", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("NO_OUTSTANDING_DUES"));
        assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(1);
    }

    @Test
    void aRiderWhoOwesNothingCannotPayAhead() throws Exception {
        assertThat(owes(NO_PLAN_RIDER_CODE)).isZero();
        tryPay(NO_PLAN_RIDER_CODE, 175_000, "CASH", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("NO_OUTSTANDING_DUES"));
    }

    /** A retry of a payment that paid the rider up gets that payment back, not "nothing owed". */
    @Test
    void aRetryOfThePaymentThatClearedTheDuesReturnsItInsteadOfRefusing() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        JsonNode first = pay(MONDAY_RIDER_CODE, before, "UPI", "clear-1");
        JsonNode again = pay(MONDAY_RIDER_CODE, before, "UPI", "clear-1");
        assertThat(again.get("id").asString()).isEqualTo(first.get("id").asString());
        assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(1);
    }

    /** Two staff collecting the whole amount at once: one lands, the other is refused. */
    @Test
    void twoFullPaymentsAtOnceCannotOvercollect() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> calls = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                String key = "race-" + i;
                calls.add(() -> tryPay(MONDAY_RIDER_CODE, before, "CASH", key).andReturn().getResponse().getStatus());
            }
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(calls)) statuses.add(f.get());
            assertThat(statuses).containsExactlyInAnyOrder(200, 409);
            assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(1);
            assertThat(owes(MONDAY_RIDER_CODE)).isZero();
        } finally {
            pool.shutdownNow();
        }
    }

    /** A reversal puts the dues back, so the rider can be collected from again. */
    @Test
    void afterAReversalTheDuesCanBeCollectedAgain() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        String id = pay(MONDAY_RIDER_CODE, before, "CASH", null).get("id").asString();
        reverse(id, "Wrong amount", admin).andExpect(status().isOk());
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(before);
        pay(MONDAY_RIDER_CODE, before, "UPI", null);
        assertThat(owes(MONDAY_RIDER_CODE)).isZero();
    }

    @Test
    void theSameFormSentTwiceSavesOnePayment() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        JsonNode first = pay(MONDAY_RIDER_CODE, 10_000, "UPI", "form-1");
        JsonNode again = pay(MONDAY_RIDER_CODE, 10_000, "UPI", "form-1");

        assertThat(again.get("id").asString()).isEqualTo(first.get("id").asString());
        assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(1);
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(before - 10_000);
    }

    @Test
    void twoPaymentsAtOnceBothLandAndEachSeesTheOther() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<JsonNode>> calls = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                String key = "parallel-" + i;
                calls.add(() -> pay(MONDAY_RIDER_CODE, 1_000, "CASH", key));
            }
            List<Long> afters = new ArrayList<>();
            List<Long> befores = new ArrayList<>();
            for (Future<JsonNode> f : pool.invokeAll(calls)) {
                afters.add(f.get().get("owedAfter").asLong());
                befores.add(f.get().get("owedBefore").asLong());
            }
            assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(2);
            assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(before - 2_000);
            // One went first: the second's "before" is the first's "after".
            assertThat(befores).containsExactlyInAnyOrder(before, before - 1_000);
            assertThat(afters).containsExactlyInAnyOrder(before - 1_000, before - 2_000);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void aBadAmountOrMethodIsRefusedNamingTheField() throws Exception {
        mvc.perform(post("/api/v1/payments/collections").header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"riderId\":\"R01\",\"amount\":0,\"method\":\"UPI\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("amount"))
                .andExpect(jsonPath("$.details.code").value("INVALID_PAYMENT_AMOUNT"));
        tryPay("R01", -500, "UPI", null)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.details.code").value("INVALID_PAYMENT_AMOUNT"));
        mvc.perform(post("/api/v1/payments/collections").header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"riderId\":\"R01\",\"amount\":100,\"method\":\"CHEQUE\"}"))
                .andExpect(status().isUnprocessableContent());
        assertThat(paymentRows(MONDAY_RIDER)).isZero();
    }

    // -----------------------------------------------------------------------
    // Late
    // -----------------------------------------------------------------------

    @Test
    void paymentsCoverTheOldestWeekFirst() throws Exception {
        LocalDate start = twoLateWeeks();
        JsonNode late = account(MONDAY_RIDER_CODE);
        assertThat(late.get("lateSince").asString()).isEqualTo(start.minusWeeks(2).plusDays(6).toString());
        long lateDays = late.get("daysLate").asLong();

        pay(MONDAY_RIDER_CODE, ROUNDING_PLAN_PAISE, "UPI", null);

        JsonNode after = account(MONDAY_RIDER_CODE);
        assertThat(after.get("lateSince").asString()).isEqualTo(start.minusWeeks(1).plusDays(6).toString());
        assertThat(after.get("daysLate").asLong()).isEqualTo(lateDays - 7);
    }

    @Test
    void partPayingALateWeekLeavesItLate() throws Exception {
        twoLateWeeks();
        long lateDays = account(MONDAY_RIDER_CODE).get("daysLate").asLong();

        pay(MONDAY_RIDER_CODE, 99_900, "UPI", null); // about half a week, whole rupees

        assertThat(account(MONDAY_RIDER_CODE).get("daysLate").asLong()).isEqualTo(lateDays);
        mvc.perform(get("/api/v1/payments/collections").header("Authorization", "Bearer " + admin))
                .andExpect(jsonPath("$.rows[0].riderId").value("R01"))
                .andExpect(jsonPath("$.rows[0].stage").isNotEmpty());
    }

    // -----------------------------------------------------------------------
    // Reversals
    // -----------------------------------------------------------------------

    @Test
    void aReversalPutsTheMoneyBackAndCanOnlyHappenOnce() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        String id = pay(MONDAY_RIDER_CODE, 10_000, "CASH", null).get("id").asString();

        String reversalId = JSON.readTree(reverse(id, "Wrong rider", admin)
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.amount").value(-10_000))
                        .andExpect(jsonPath("$.reason").value("Wrong rider"))
                        .andReturn().getResponse().getContentAsString())
                .get("id").asString();

        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(before);
        reverse(id, "Again", admin).andExpect(status().isConflict());
        reverse(reversalId, "Undo the undo", admin).andExpect(status().isConflict());
        reverse(id, " ", admin).andExpect(status().is4xxClientError());

        JsonNode lines = account(MONDAY_RIDER_CODE).get("lines");
        assertThat(lines.get(0).get("kind").asString()).isEqualTo("REVERSAL");
        assertThat(lines.get(1).get("kind").asString()).isEqualTo("PAYMENT");
        assertThat(lines.get(1).get("reversed").asBoolean()).isTrue();
    }

    /** Staff may reverse only what they took themselves (ReversalRulesTest has the rest). */
    @Test
    void fleetStaffCannotReverseSomeoneElsesPayment() throws Exception {
        String id = pay(MONDAY_RIDER_CODE, 10_000, "CASH", null).get("id").asString();
        reverse(id, "Mistake", tokenFor(STAFF_EMAIL)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("REVERSE_NOT_YOURS"));
        assertThat(paymentRows(MONDAY_RIDER)).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // The account timeline
    // -----------------------------------------------------------------------

    @Test
    void theTimelineIsNewestFirstAndItsRunningBalanceEndsAtOwes() throws Exception {
        twoLateWeeks();
        pay(MONDAY_RIDER_CODE, 25_000, "UPI", null);

        JsonNode a = account(MONDAY_RIDER_CODE);
        JsonNode lines = a.get("lines");
        assertThat(lines.get(0).get("kind").asString()).isEqualTo("PAYMENT");
        assertThat(lines.get(0).get("amount").asLong()).isEqualTo(-25_000);
        assertThat(lines.get(0).get("balance").asLong()).isEqualTo(a.get("owes").asLong());
        assertThat(a.get("owes").asLong()).isEqualTo(a.get("rent").asLong() + a.get("charges").asLong() - a.get("paid").asLong());

        long sum = 0;
        for (JsonNode line : lines) sum += line.get("amount").asLong();
        assertThat(sum).isEqualTo(a.get("owes").asLong());
        // One rent line per week, oldest at the bottom.
        assertThat(lines.get(lines.size() - 1).get("kind").asString()).isEqualTo("RENT");
    }

    @Test
    void anOpenChargeIsOwedAndAHandSettledOrDepositOneIsNot() throws Exception {
        long before = owes(CHARGED_RIDER_CODE);
        LocalDate start = currentPeriodStart(BillingDay.MONDAY);
        insertCharge(TENANT, CHARGED_RIDER, 40_000, "RIDER", "OPEN", start);
        insertCharge(TENANT, CHARGED_RIDER, 30_000, "RIDER", "SETTLED", start);
        insertCharge(TENANT, CHARGED_RIDER, 20_000, "DEPOSIT", "OPEN", start);

        JsonNode a = account(CHARGED_RIDER_CODE);
        assertThat(a.get("owes").asLong()).isEqualTo(before + 40_000);
        assertThat(a.get("charges").asLong()).isEqualTo(40_000);
    }

    @Test
    void aRiderWithNoPlanOwesNothing() throws Exception {
        assertThat(owes(NO_PLAN_RIDER_CODE)).isZero();
    }

    /** Unpaid rent at return becomes a charge; paying it after the bike is back counts. */
    @Test
    void aReturnedRiderCanPayOffWhatTheyLeftOwing() throws Exception {
        superAdmin(jdbc -> {
            jdbc.update("UPDATE assignments SET ended_on = CURRENT_DATE - 2, reason = 'RETURNED', "
                    + "return_condition = 'NONE', next_vehicle_state = 'QC_PENDING', closed_by = 'Test', "
                    + "outstanding_rent_paise = 50000 WHERE rider_id = ?", MONDAY_RIDER);
            jdbc.update("INSERT INTO rider_charges (tenant_id, rider_id, amount_paise, liability, status, charged_on, period_start) "
                    + "VALUES (?, ?, 50000, 'RIDER', 'OPEN', now() - interval '1 day', CURRENT_DATE - 1)", TENANT, MONDAY_RIDER);
            return null;
        });
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(50_000);

        pay(MONDAY_RIDER_CODE, 20_000, "CASH", null);

        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(30_000);
        mvc.perform(get("/api/v1/payments/collections").header("Authorization", "Bearer " + admin))
                .andExpect(jsonPath("$.rows[?(@.riderId == 'R01')].owes").value(30_000));
    }

    /** Bike back, settlement not approved yet, a repair raised since: paying it counts. */
    @Test
    void aRiderWithNoBikeCanPayOffARepairRaisedAfterTheReturn() throws Exception {
        superAdmin(jdbc -> jdbc.update("UPDATE assignments SET ended_on = CURRENT_DATE - 3, reason = 'RETURNED', "
                + "return_condition = 'NONE', next_vehicle_state = 'QC_PENDING', closed_by = 'Test' WHERE rider_id = ?",
                MONDAY_RIDER));
        insertCharge(TENANT, MONDAY_RIDER, 10_000, "RIDER", "OPEN", today());
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(10_000);

        tryPay(MONDAY_RIDER_CODE, 70_000, "CASH", null).andExpect(status().isUnprocessableContent());
        pay(MONDAY_RIDER_CODE, 10_000, "CASH", null);

        assertThat(owes(MONDAY_RIDER_CODE)).isZero();
    }

    /**
     * Paid in full at 12:20, bike back at 12:50: that payment went into the
     * figure on the return form, so it is not counted again afterwards — the
     * rider owes nothing, not "ahead" by everything they just paid. A repair
     * found once the bike is back is new and is owed.
     */
    @Test
    void aPaymentJustBeforeTheReturnIsNotCountedAgainAfterIt() throws Exception {
        insertCharge(TENANT, MONDAY_RIDER, 70_000, "RIDER", "OPEN", currentPeriodStart(BillingDay.MONDAY));
        long before = owes(MONDAY_RIDER_CODE);
        pay(MONDAY_RIDER_CODE, before, "CASH", null);
        assertThat(owes(MONDAY_RIDER_CODE)).isZero();

        superAdmin(jdbc -> jdbc.update("UPDATE assignments SET ended_on = CURRENT_DATE, closed_at = clock_timestamp(), "
                + "reason = 'SERVICE_ISSUE', return_condition = 'MINOR', next_vehicle_state = 'QC_PENDING', "
                + "closed_by = 'Test', outstanding_rent_paise = 0 WHERE rider_id = ?", MONDAY_RIDER));
        assertThat(owes(MONDAY_RIDER_CODE)).isZero();

        superAdmin(jdbc -> jdbc.update("INSERT INTO rider_charges (tenant_id, rider_id, amount_paise, liability, status, charged_on, period_start) "
                + "VALUES (?, ?, 10000, 'RIDER', 'OPEN', clock_timestamp(), CURRENT_DATE)", TENANT, MONDAY_RIDER));
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(10_000);
        tryPay(MONDAY_RIDER_CODE, 10_001, "UPI", null).andExpect(status().isUnprocessableContent());
        pay(MONDAY_RIDER_CODE, 10_000, "UPI", null);
        assertThat(owes(MONDAY_RIDER_CODE)).isZero();
    }

    /** Approving the return folds repairs from before it into the return figure; a later one stays owed. */
    @Test
    void approvingAReturnFoldsOnlyTheRepairsFromBeforeIt() throws Exception {
        UUID old = insertCharge(TENANT, MONDAY_RIDER, 70_000, "RIDER", "OPEN", currentPeriodStart(BillingDay.MONDAY));
        UUID assignment = superAdmin(jdbc -> {
            jdbc.update("UPDATE rider_charges SET charged_on = now() - interval '1 hour' WHERE id = ?", old);
            jdbc.update("UPDATE assignments SET ended_on = CURRENT_DATE, closed_at = now() - interval '1 minute', "
                    + "reason = 'RETURNED', return_condition = 'NONE', next_vehicle_state = 'QC_PENDING', "
                    + "closed_by = 'Test', outstanding_rent_paise = 50000 WHERE rider_id = ?", MONDAY_RIDER);
            jdbc.update("INSERT INTO rider_charges (tenant_id, rider_id, amount_paise, liability, status, charged_on, period_start) "
                    + "VALUES (?, ?, 10000, 'RIDER', 'OPEN', now(), CURRENT_DATE)", TENANT, MONDAY_RIDER);
            return jdbc.queryForObject("SELECT id FROM assignments WHERE rider_id = ?", UUID.class, MONDAY_RIDER);
        });
        // Before approval: only the repair found after the return.
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(10_000);

        mvc.perform(post("/api/v1/assignments/settlements/" + assignment + "/approve")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk());

        // The return figure (₹500, the old repair inside it) plus the later repair.
        assertThat(owes(MONDAY_RIDER_CODE)).isEqualTo(60_000);
    }

    // -----------------------------------------------------------------------
    // End of day and the audit log
    // -----------------------------------------------------------------------

    @Test
    void todayTotalsByWhoTookItAndHowAndAReversalComesOff() throws Exception {
        pay(MONDAY_RIDER_CODE, 10_000, "UPI", null);
        String cash = pay(CHARGED_RIDER_CODE, 5_000, "CASH", null).get("id").asString();
        reverse(cash, "Counted twice", admin).andExpect(status().isOk());

        JsonNode today = getJson("/api/v1/payments/today", admin);
        assertThat(today.get("total").asLong()).isEqualTo(10_000);
        assertThat(today.get("count").asInt()).isEqualTo(2);
        assertThat(today.get("payments")).hasSize(3);
        JsonNode meenakshi = today.get("byStaff").get(0);
        assertThat(meenakshi.get("name").asString()).isEqualTo("Meenakshi Iyer");
        assertThat(meenakshi.get("upi").asLong()).isEqualTo(10_000);
        assertThat(meenakshi.get("cash").asLong()).isZero();

        getJson("/api/v1/payments/today?date=" + today().minusDays(1), admin);
    }

    // -----------------------------------------------------------------------
    // Payments over a date range
    // -----------------------------------------------------------------------

    private void paymentOn(UUID riderId, LocalDate day, long paise) {
        // 23:30 IST — the last half hour of the day, which a UTC cut-off would push into the next one.
        superAdmin(jdbc -> jdbc.update("INSERT INTO payment_collections (tenant_id, rider_id, amount_paise, method, collected_on) "
                + "VALUES (?, ?, ?, 'CASH', (?::date + time '23:30') AT TIME ZONE 'Asia/Kolkata')",
                TENANT, riderId, paise, day.toString()));
    }

    @Test
    void aRangeIncludesBothEndDaysInIndianTime() throws Exception {
        LocalDate today = today();
        paymentOn(MONDAY_RIDER, today.minusDays(10), 1_000);
        paymentOn(MONDAY_RIDER, today.minusDays(6), 2_000);  // first day of the range
        paymentOn(MONDAY_RIDER, today.minusDays(3), 3_000);
        paymentOn(MONDAY_RIDER, today.minusDays(1), 4_000);  // last day, 23:30
        paymentOn(MONDAY_RIDER, today, 5_000);               // the day after the range

        JsonNode range = getJson("/api/v1/payments/today?from=" + today.minusDays(6) + "&to=" + today.minusDays(1), admin);

        assertThat(range.get("from").asString()).isEqualTo(today.minusDays(6).toString());
        assertThat(range.get("to").asString()).isEqualTo(today.minusDays(1).toString());
        assertThat(range.get("total").asLong()).isEqualTo(9_000);
        assertThat(range.get("payments")).hasSize(3);
    }

    @Test
    void aRangeWithNoPaymentsIsEmptyNotAnError() throws Exception {
        LocalDate day = today().minusYears(2);
        JsonNode range = getJson("/api/v1/payments/today?from=" + day + "&to=" + day.plusDays(6), admin);
        assertThat(range.get("total").asLong()).isZero();
        assertThat(range.get("payments")).isEmpty();
        assertThat(range.get("byStaff")).isEmpty();
    }

    @Test
    void aBackwardsOrHalfRangeIsRefused() throws Exception {
        LocalDate day = today();
        for (String query : List.of("from=" + day + "&to=" + day.minusDays(1), "from=" + day, "to=" + day,
                "from=" + day.minusYears(2) + "&to=" + day)) {
            mvc.perform(get("/api/v1/payments/today?" + query).header("Authorization", "Bearer " + admin))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(jsonPath("$.details.code").value("INVALID_DATE_RANGE"));
        }
    }

    @Test
    void theAuditLogShowsWhatWasOwedBeforeAndAfter() throws Exception {
        long before = owes(MONDAY_RIDER_CODE);
        pay(MONDAY_RIDER_CODE, 10_000, "UPI", null);

        JsonNode entry = getJson("/api/v1/audit?size=50", admin).get("content").valueStream()
                .filter(e -> "Payment recorded".equals(e.get("action").asString()))
                .findFirst().orElseThrow();
        assertThat(entry.get("before").asString()).isEqualTo("Owed " + rupees(before));
        assertThat(entry.get("after").asString()).isEqualTo("Paid 100.00 upi · owes " + rupees(before - 10_000));
    }

    private static String rupees(long paise) {
        return java.math.BigDecimal.valueOf(paise, 2).toPlainString();
    }

    // -----------------------------------------------------------------------
    // Who may do what
    // -----------------------------------------------------------------------

    @Test
    void onlyAdminsHandleMoneyButFleetStaffMayReadAnAccount() throws Exception {
        String staff = tokenFor(STAFF_EMAIL);
        String manager = tokenFor(MANAGER_EMAIL);
        for (String url : List.of("/api/v1/payments/collections", "/api/v1/payments/today")) {
            mvc.perform(get(url).header("Authorization", "Bearer " + staff)).andExpect(status().isForbidden());
            mvc.perform(get(url).header("Authorization", "Bearer " + manager)).andExpect(status().isForbidden());
            mvc.perform(get(url)).andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/payments/collections").header("Authorization", "Bearer " + staff)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"riderId\":\"R01\",\"amount\":100,\"method\":\"UPI\"}"))
                .andExpect(status().isForbidden());
        getJson("/api/v1/payments/riders/R01/account", staff);
        mvc.perform(get("/api/v1/payments/riders/R01/account").header("Authorization", "Bearer " + manager))
                .andExpect(status().isForbidden());
    }

    @Test
    void anotherTenantsRiderIsNotFound() throws Exception {
        mvc.perform(get("/api/v1/payments/riders/" + RIVAL_RIDER_CODE + "/account")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/payments/collections").header("Authorization", "Bearer " + admin))
                .andExpect(jsonPath("$.rows[?(@.riderId == 'R21')]").isEmpty());
    }
}
