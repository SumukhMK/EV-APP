package com.evrental.service;

/**
 * How a bike reached the workshop, matching ServiceJobSource in
 * frontend/app/src/types/serviceJob.ts.
 *
 * <p>Kept because "why is this bike here" is the first question at the desk and
 * the last one in a report: a rider handed it back, a swap left it behind, a
 * recovery team fetched it, someone rode in, or it was a routine check.
 */
public enum ServiceJobSource {
    /** The rider gave the bike back. */
    DEBOARD,
    /** The old bike came back during a swap. */
    EXCHANGE,
    /** Roadside assistance went out and picked it up. */
    RSA,
    /** The quick response team was sent out. */
    QRT,
    /** The rider rode in with a problem. */
    WALK_IN,
    /** A routine check, with no fault reported. */
    INSPECTION,
    /** Migrated from the old records, where the reason was never captured. */
    REGISTRY
}
