package com.evrental.payment;

/**
 * How far along the chasing has got, matching DunningStage in
 * frontend/app/src/types/payment.ts.
 *
 * <p>Computed from {@code daysOverdue}, never stored. Nothing records that a
 * reminder was actually sent because nothing can send one yet — the
 * notification module is not built, and the overdue screen's CTAs stay mock
 * until it is. Storing a stage now would be storing a claim the system cannot
 * support.
 */
public enum DunningStage {
    REMINDER_DUE,
    WARNING_1,
    WARNING_2,
    REPOSSESSION_DUE;

    /** The mock's stageFor, unchanged — mocks/payments.ts is the authority. */
    public static DunningStage forDays(long daysOverdue) {
        if (daysOverdue >= 21) {
            return REPOSSESSION_DUE;
        }
        if (daysOverdue >= 14) {
            return WARNING_2;
        }
        if (daysOverdue >= 7) {
            return WARNING_1;
        }
        return REMINDER_DUE;
    }
}
