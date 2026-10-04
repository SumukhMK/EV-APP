package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Generating a run, and the arithmetic frozen into it.
 *
 * <p>The thing under test that matters most is not any single number — it is
 * that the numbers stop moving. A run row is written once; a plan change after
 * that must not reach it, or every receipt in the archive quietly restates
 * itself.
 */
class PaymentRunGenerationTest extends PaymentRunTestBase {

    private String token;
    private LocalDate monday;

    @BeforeEach
    void logIn() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        monday = currentPeriodStart(BillingDay.MONDAY);
    }

    @Test
    void aRunIsTheRidersInThatCycleOneRowEach() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.periodStart").value(monday.toString()))
                .andExpect(jsonPath("$.periodEnd").value(monday.plusDays(6).toString()))
                .andExpect(jsonPath("$.billingDay").value("MONDAY"))
                // Anil, Bhavana, Chetan — sorted by name. Deepa bills Wednesday.
                .andExpect(jsonPath("$.rows.length()").value(3))
                .andExpect(jsonPath("$.rows[0].riderName").value("Anil Shetty"))
                .andExpect(jsonPath("$.rows[2].riderName").value("Chetan Naik"));
    }

    @Test
    void ridersOnTheOtherCycleAreNotInThisRun() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Deepa Hegde')]").isEmpty());

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=WEDNESDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.periodStart").value(currentPeriodStart(BillingDay.WEDNESDAY).toString()))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].riderName").value("Deepa Hegde"));
    }

    /**
     * The ₹1,999 case, and the reason proration is written the way it is.
     *
     * <p>{@code round(199900 / 7)} is 28,557 paise and seven of those is
     * ₹1,998.99 — a paise short of the plan. Billing {@code perDay × 7} would
     * undercharge every rider on this plan, every week, forever, and the rows
     * drawn on artboard 15 show the plan exactly. So a full week bills the
     * plan and proration applies only below seven days.
     */
    @Test
    void aFullWeekBillsThePlanExactly() throws Exception {
        long perDay = Math.round(ROUNDING_PLAN_PAISE / 7.0);
        assertThat(perDay * 7).isNotEqualTo(ROUNDING_PLAN_PAISE);

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[0].riderId").value(MONDAY_RIDER_CODE))
                .andExpect(jsonPath("$.rows[0].planAmount").value(ROUNDING_PLAN_PAISE))
                .andExpect(jsonPath("$.rows[0].daysBilled").value(7))
                .andExpect(jsonPath("$.rows[0].perDayAmount").value(perDay))
                .andExpect(jsonPath("$.rows[0].billedAmount").value(ROUNDING_PLAN_PAISE))
                .andExpect(jsonPath("$.rows[0].totalDue").value(ROUNDING_PLAN_PAISE));
    }

    /**
     * A rider with no plan still gets a line.
     *
     * <p>Zero, not absent. A run that silently omits people is how somebody
     * stops being billed by accident, and nobody notices until the quarter.
     */
    @Test
    void aRiderWithNoPlanGetsAZeroRowNotAMissingOne() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[2].riderId").value(NO_PLAN_RIDER_CODE))
                .andExpect(jsonPath("$.rows[2].daysBilled").value(0))
                .andExpect(jsonPath("$.rows[2].billedAmount").value(0))
                .andExpect(jsonPath("$.rows[2].totalDue").value(0));
    }

    /**
     * The run names the bike the rider held.
     *
     * <p>This test used to be called {@code vehicleIsNullUntilS5} and asserted
     * the opposite, because {@code payment.AssignmentQuery} had only the
     * {@code NoAssignmentsYet} stub behind it. S5 shipped and it stayed that
     * way — the assignment module published a different interface of the same
     * name — so the column went on being null long after the database could
     * answer it. Now it is answered, and the id is the one an operator reads
     * off the frame rather than a row id.
     */
    @Test
    void theRunNamesTheBikeTheRiderHeld() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[0].vehicleId").value("BLRSS0428"));
    }

    // -----------------------------------------------------------------------
    // The money split
    // -----------------------------------------------------------------------

    @Test
    void serviceChargesAreThisPeriodsAndArrearsAreEverythingBefore() throws Exception {
        insertCharge(TENANT, CHARGED_RIDER, 31_000, "RIDER", "OPEN", monday);
        insertCharge(TENANT, CHARGED_RIDER, 50_000, "RIDER", "OPEN", monday.minusWeeks(1));
        insertCharge(TENANT, CHARGED_RIDER, 20_000, "RIDER", "OPEN", monday.minusWeeks(2));

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[1].riderId").value(CHARGED_RIDER_CODE))
                .andExpect(jsonPath("$.rows[1].serviceCharges").value(31_000))
                .andExpect(jsonPath("$.rows[1].arrears").value(70_000))
                .andExpect(jsonPath("$.rows[1].totalDue").value(PLAIN_PLAN_PAISE + 31_000 + 70_000));
    }

    /**
     * A DEPOSIT charge is drawn from what is held, never billed. The contract
     * says so outright, and billing it here would charge the rider twice for
     * one dent.
     */
    @Test
    void aDepositChargeAppearsInNeitherColumn() throws Exception {
        insertCharge(TENANT, CHARGED_RIDER, 44_000, "DEPOSIT", "OPEN", monday);
        insertCharge(TENANT, CHARGED_RIDER, 33_000, "DEPOSIT", "OPEN", monday.minusWeeks(1));

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[1].serviceCharges").value(0))
                .andExpect(jsonPath("$.rows[1].arrears").value(0))
                .andExpect(jsonPath("$.rows[1].totalDue").value(PLAIN_PLAN_PAISE));
    }

    @Test
    void aSettledChargeAppearsInNeitherColumn() throws Exception {
        insertCharge(TENANT, CHARGED_RIDER, 44_000, "RIDER", "SETTLED", monday);
        insertCharge(TENANT, CHARGED_RIDER, 33_000, "RIDER", "SETTLED", monday.minusWeeks(1));

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[1].serviceCharges").value(0))
                .andExpect(jsonPath("$.rows[1].arrears").value(0))
                .andExpect(jsonPath("$.rows[1].totalDue").value(PLAIN_PLAN_PAISE));
    }

    // -----------------------------------------------------------------------
    // Idempotency and the freeze
    // -----------------------------------------------------------------------

    /**
     * Generation is a side effect of a read, so two people opening the screen
     * in the same second both try to write the week. The unique index makes
     * the second one a no-op.
     */
    @Test
    void twoConcurrentReadsProduceOneSetOfRows() throws Exception {
        Callable<Integer> openTheRun = () -> mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> both = pool.invokeAll(List.of(openTheRun, openTheRun));
            for (Future<Integer> f : both) {
                assertThat(f.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        Long rows = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM payment_periods WHERE tenant_id = ? AND period_start = ?",
                Long.class, TENANT, monday));
        assertThat(rows).isEqualTo(3L);
    }

    /**
     * The invariant the whole design exists to protect.
     *
     * <p>The mock recomputes a run from the riders on every read, so raising a
     * plan silently rewrites history. A frozen row cannot: the new plan is
     * what next week bills, and this week still says what it said.
     */
    @Test
    void changingAPlanAfterGenerationMovesNothing() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[0].planAmount").value(ROUNDING_PLAN_PAISE));

        superAdmin(jdbc -> jdbc.update(
                "UPDATE riders SET plan_amount_paise = 250000 WHERE id = ?", MONDAY_RIDER));

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[0].planAmount").value(ROUNDING_PLAN_PAISE))
                .andExpect(jsonPath("$.rows[0].billedAmount").value(ROUNDING_PLAN_PAISE))
                .andExpect(jsonPath("$.rows[0].totalDue").value(ROUNDING_PLAN_PAISE));
    }

    /** A charge raised after the week was frozen belongs to the week, not to this row. */
    @Test
    void aChargeRaisedAfterGenerationDoesNotMoveTheFrozenRow() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[1].totalDue").value(PLAIN_PLAN_PAISE));

        insertCharge(TENANT, CHARGED_RIDER, 60_000, "RIDER", "OPEN", monday);

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[1].serviceCharges").value(0))
                .andExpect(jsonPath("$.rows[1].totalDue").value(PLAIN_PLAN_PAISE));
    }

    /** Another tenant's riders are not on this run, and RLS is what says so. */
    @Test
    void anotherTenantsRidersAreNotOnThisRun() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Rival Rider')]").isEmpty());

        Long rivalRows = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM payment_periods WHERE tenant_id = ?", Long.class, OTHER_TENANT));
        assertThat(rivalRows).isZero();
    }
}
