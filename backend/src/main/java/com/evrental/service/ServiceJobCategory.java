package com.evrental.service;

/**
 * Which board owns a job card: the desk's or the workshop's.
 *
 * <p>Derived from the source, never sent by the client — the two boards are
 * filtered views over one set of jobs (docs/backend/SERVICE_INFRA_SPLIT.md),
 * and letting a caller name the category is how a bike ends up on the wrong
 * one with a rider it no longer has.
 */
public enum ServiceJobCategory {
    /** An active rider's bike: they rode in, or roadside assistance went out. */
    WALK_IN_RSA,
    /** A returned or recovered bike, in the hub's hands with no rider on it. */
    HUB;

    public static ServiceJobCategory of(ServiceJobSource source) {
        return source == ServiceJobSource.WALK_IN || source == ServiceJobSource.RSA ? WALK_IN_RSA : HUB;
    }
}
