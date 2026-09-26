package com.evrental.service;

import com.evrental.vehicle.VehicleState;

/**
 * The nine workshop queues, matching SERVICE_QUEUES in
 * frontend/app/src/types/serviceJob.ts exactly and in the same order.
 *
 * <p>Each queue carries the bike state it implies. That pairing is the whole
 * routing rule, so it lives here once rather than as a switch in the service,
 * another in the controller and a third in a test: moving a job to a queue and
 * moving the bike are the same decision, and a queue whose state had to be
 * looked up somewhere else is a queue someone will forget to look up.
 */
public enum ServiceQueue {
    ASSESSMENT("Assessment", VehicleState.UNDER_REPAIR),
    MINOR_REPAIR("Minor repair", VehicleState.UNDER_REPAIR),
    MAJOR_REPAIR("Major repair", VehicleState.UNDER_REPAIR),
    ACCIDENT("Accident", VehicleState.ACCIDENT),
    WARRANTY("Warranty", VehicleState.UNDER_REPAIR),
    INSURANCE("Insurance", VehicleState.UNDER_REPAIR),
    PARTS_WAITING("Waiting for parts", VehicleState.UNDER_REPAIR),
    QC_PENDING("Quality check", VehicleState.QC_PENDING),
    READY_TO_DEPLOY("Ready to deploy", VehicleState.READY_TO_DEPLOY);

    private final String label;
    private final VehicleState vehicleState;

    ServiceQueue(String label, VehicleState vehicleState) {
        this.label = label;
        this.vehicleState = vehicleState;
    }

    public String label() {
        return label;
    }

    /** The state a bike must be in while it sits in this queue. */
    public VehicleState vehicleState() {
        return vehicleState;
    }

    /** Whether work in this queue is repair work, as opposed to QC or release. */
    public boolean isRepair() {
        return vehicleState == VehicleState.UNDER_REPAIR || this == ACCIDENT;
    }
}
