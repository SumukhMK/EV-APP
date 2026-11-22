package com.evrental.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The two pure sums every money screen now leans on. */
class RiderAccountsArithmeticTest {

    private static final long PLAN = 199900;
    private static final long PER_DAY = Math.round(PLAN / 7.0); // 28557

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
}
