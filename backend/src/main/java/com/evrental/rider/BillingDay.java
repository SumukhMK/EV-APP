package com.evrental.rider;

/**
 * Which of Ashok's two billing cycles a rider is on, matching BillingDay in
 * frontend/app/src/types/rider.ts. Drives the S6 weekly runs.
 */
public enum BillingDay {
    MONDAY,
    WEDNESDAY
}