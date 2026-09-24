package com.evrental.vehicle;

import java.time.LocalDate;

/**
 * The list/create shape. currentRiderId and currentRiderName are deliberately
 * null until S5 owns assignments; they are a property of the open assignment,
 * not of the vehicle row itself.
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

    public static VehicleResponse from(Vehicle v) {
        return new VehicleResponse(
                v.getRegistryId(), v.getChassisNumber(), v.getModel(), v.getBatteryType(),
                v.getBatteryVendor(), v.getHub(), v.getState(), null, null,
                v.getInductedOn(), v.getRegistrationNumber(), v.getOdometerKm());
    }
}
