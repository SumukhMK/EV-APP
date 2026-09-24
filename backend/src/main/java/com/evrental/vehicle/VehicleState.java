package com.evrental.vehicle;

/**
 * The nine states a bike can be in, matching VEHICLE_STATES in
 * frontend/app/src/types/vehicle.ts exactly and in the same order.
 *
 * <p>The label is what the UI prints, from lib/labels.ts. It is carried here
 * because a 409 has to name both states in the words the person on the screen
 * is reading -- "a vehicle that is In Service cannot be Active" is a sentence;
 * "UNDER_REPAIR cannot go to DEPLOYED" is a stack trace.
 */
public enum VehicleState {
    INDUCTED("Onboarding"),
    READY_TO_DEPLOY("Ready to Deploy"),
    DEPLOYED("Active"),
    RETURNED("Returned (legacy)"),
    RECOVERY("Recovery"),
    UNDER_REPAIR("In Service"),
    QC_PENDING("Quality Check"),
    ACCIDENT("Accident"),
    RETIRED("Retired");

    private final String label;

    VehicleState(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
