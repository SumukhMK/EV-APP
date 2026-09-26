package com.evrental.service;

/**
 * How bad it is, matching DamageCategory in
 * frontend/app/src/types/vehicle.ts.
 *
 * <p>The damage decides the route, not the other way round — the deboard form
 * already defaults the next vehicle state from it (CONDITION_DEFAULT_STATE in
 * lib/labels.ts), and the default queue below is the same rule on this side of
 * the wire. A caller may still name a queue explicitly; this is the answer when
 * they do not.
 */
public enum DamageCategory {
    NONE("Undamaged", ServiceQueue.QC_PENDING),
    MINOR("Minor", ServiceQueue.MINOR_REPAIR),
    MAJOR("Major", ServiceQueue.MAJOR_REPAIR),
    ACCIDENT("Accident", ServiceQueue.ACCIDENT);

    private final String label;
    private final ServiceQueue defaultQueue;

    DamageCategory(String label, ServiceQueue defaultQueue) {
        this.label = label;
        this.defaultQueue = defaultQueue;
    }

    public String label() {
        return label;
    }

    /** Where a job goes when the caller does not name a queue. */
    public ServiceQueue defaultQueue() {
        return defaultQueue;
    }
}
