package com.evrental.rider;

/**
 * A rider's status, and there are two: holding a bike, or on the register
 * without one (Sumukh, 2026-10-05). It is a fact about the open assignment
 * said in one word — never a decision about the person. A deboard makes a
 * rider INACTIVE; the next assignment makes them ACTIVE; nothing else
 * writes it. RiderResponse derives it from the open assignment, so the wire
 * cannot disagree with the assignments table even if the column drifts.
 */
public enum RiderStatus {
    /** Holds a bike right now. */
    ACTIVE("Active"),
    /** On the register, no bike right now — freshly onboarded, or deboarded. */
    INACTIVE("Inactive");

    private final String label;

    RiderStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
