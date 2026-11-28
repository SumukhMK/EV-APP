package com.evrental.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The two pure sums every money screen now leans on. */
class RiderAccountsArithmeticTest {

    private static final long PLAN = 199900;
    private static final long PER_DAY = RiderAccounts.perDay(PLAN); // whole rupees

    @Test
    void wholeWeeksBillThePlanExactlyAndOnlyTheRemainderIsProrated() {
        assertThat(RiderAccounts.rent(PLAN, PER_DAY, 7)).isEqualTo(PLAN);
        assertThat(RiderAccounts.rent(PLAN, PER_DAY, 14)).isEqualTo(2 * PLAN);
        assertThat(RiderAccounts.rent(PLAN, PER_DAY, 10)).isEqualTo(PLAN + 3 * PER_DAY);
        assertThat(RiderAccounts.rent(PLAN, PER_DAY, 0)).isZero();
    }

    @Test
    void paymentsCoverDaysFromTheFirstAndNeverMoreThanHaveRun() {
        assertThat(RiderAccounts.coveredDays(PLAN, PER_DAY, 0, 20)).isZero();
        assertThat(RiderAccounts.coveredDays(PLAN, PER_DAY, PLAN, 20)).isEqualTo(7);
        assertThat(RiderAccounts.coveredDays(PLAN, PER_DAY, PLAN + 2 * PER_DAY + 1, 20)).isEqualTo(9);
        assertThat(RiderAccounts.coveredDays(PLAN, PER_DAY, 10 * PLAN, 20)).isEqualTo(20);
        // A plan of nothing owes nothing: every day is covered.
        assertThat(RiderAccounts.coveredDays(0, 0, 0, 20)).isEqualTo(20);
    }

    /** A day is a seventh of the plan to the nearest whole rupee — what the screen shows is what is charged. */
    @org.junit.jupiter.api.Test
    void aDayIsASeventhOfThePlanInWholeRupees() {
        assertThat(RiderAccounts.perDay(219_900)).isEqualTo(31_400);   // ₹2,199 → ₹314 (314.14)
        assertThat(RiderAccounts.perDay(170_000)).isEqualTo(24_300);   // ₹1,700 → ₹243 (242.86)
        assertThat(RiderAccounts.perDay(175_000)).isEqualTo(25_000);   // ₹1,750 → ₹250 exactly
        assertThat(RiderAccounts.perDay(0)).isZero();
        assertThat(RiderAccounts.perDay(219_900) % 100).isZero();
    }
}
