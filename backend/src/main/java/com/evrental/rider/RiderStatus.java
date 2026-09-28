package com.evrental.rider;

/**
 * The seven states a rider can be in, matching RIDER_STATUSES in
 * frontend/app/src/types/rider.ts exactly and in the same order.
 *
 * <p>The label is what the UI prints, from lib/labels.ts. It is carried here
 * because a facet chip or an error has to name the state in the words the
 * person on the screen is reading — "Inactive (legacy)" is a register entry;
 * "INACTIVE" is a stack trace.
 */
public enum RiderStatus {
    ONBOARDING("Onboarding"),
    ACTIVE("Active"),
    SUSPENDED("Suspended"),
    DEBOARDED("Deboarded"),
    OFFBOARDED("Offboarded"),
    BLACKLISTED("Blacklisted"),
    /** @deprecated Use SUSPENDED or DEBOARDED instead. Kept for legacy data. */
    INACTIVE("Inactive (legacy)");

    private final String label;

    RiderStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}