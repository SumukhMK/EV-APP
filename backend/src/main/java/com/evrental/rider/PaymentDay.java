package com.evrental.rider;

/**
 * The day this rider says they pay, matching PaymentDay in
 * frontend/app/src/types/rider.ts.
 *
 * <p>NOT the billing period. BillingDay drives the Monday and Wednesday runs;
 * this is captured and displayed and feeds no calculation until Ashok says
 * which wins.
 */
public enum PaymentDay {
    MONDAY,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY,
    SUNDAY
}