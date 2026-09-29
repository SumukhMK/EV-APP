package com.evrental.assignment;

/**
 * Why a rider gave the bike back, matching DeboardReason in
 * frontend/app/src/types/assignment.ts exactly.
 *
 * <p>Separate from the return condition: "went to hometown" and "minor
 * damage" are answers to different questions, and the deboard form asks both.
 */
public enum DeboardReason {
    RECOVERED_BY_TEAM,
    ACCIDENT,
    LEFT_AT_HUB,
    LEFT_AT_ROADSIDE,
    SERVICE_ISSUE,
    PAYMENT_ISSUE,
    WENT_HOME,
    RETURNED,
    OTHER
}