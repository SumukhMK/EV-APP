package com.evrental.assignment;

/**
 * Why a rider swapped bikes, matching ExchangeReason in
 * frontend/app/src/types/assignment.ts exactly.
 */
public enum ExchangeReason {
    BREAKDOWN,
    BATTERY_ISSUE,
    ACCIDENT,
    SERVICE_REQUIRED,
    RIDER_REQUEST,
    UPGRADE,
    OTHER
}