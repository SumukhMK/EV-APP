package com.evrental.vehicle;

import com.evrental.assignment.CurrentRider;
import java.time.LocalDate;

/**
 * The list/create shape. currentRiderId and currentRiderName are a property of
 * the open assignment, not of the vehicle row itself — the caller
 * (VehicleController) answers them from the assignment module and passes them
 * in.
 */
public record VehicleResponse(
        String id,
        String chassisNumber,
        String model,
        String batteryType,
        String batteryVendor,
        String hub,
        VehicleState state,
        String currentRiderId,
        String currentRiderName,
        LocalDate inductedOn,
        String registrationNumber,
        Integer odometerKm) {

    /** The rider currently on this bike, or null if it has no open assignment. */
    public static VehicleResponse from(Vehicle v, CurrentRider rider) {
        return new VehicleResponse(
                v.getRegistryId(), v.getChassisNumber(), v.getModel(), v.getBatteryType(),
                v.getBatteryVendor(), v.getHub(), v.getState(),
                rider == null ? null : rider.id(),
                rider == null ? null : rider.name(),
                v.getInductedOn(), v.getRegistrationNumber(), v.getOdometerKm());
    }

    /** A bike with no rider. Kept for the create path, where no assignment exists yet. */
    public static VehicleResponse from(Vehicle v) {
        return from(v, null);
    }
}
