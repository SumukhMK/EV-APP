package com.evrental.vehicle;

import java.time.LocalDate;
import java.util.List;

/** A vehicle plus its lifecycle history; assignments stay empty until S5. */
public record VehicleDetailResponse(
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
        Integer odometerKm,
        String make,
        String motorNumber,
        String controllerNumber,
        String rfidTag,
        String iotNumber,
        LocalDate purchaseDate,
        List<VehicleLifecycleEventResponse> lifecycle,
        List<Object> assignments) {

    public static VehicleDetailResponse from(Vehicle vehicle, List<VehicleLifecycleEvent> lifecycleEvents) {
        return new VehicleDetailResponse(
                vehicle.getRegistryId(),
                vehicle.getChassisNumber(),
                vehicle.getModel(),
                vehicle.getBatteryType(),
                vehicle.getBatteryVendor(),
                vehicle.getHub(),
                vehicle.getState(),
                null,
                null,
                vehicle.getInductedOn(),
                vehicle.getRegistrationNumber(),
                vehicle.getOdometerKm(),
                vehicle.getMake(),
                vehicle.getMotorNumber(),
                vehicle.getControllerNumber(),
                vehicle.getRfidTag(),
                vehicle.getIotNumber(),
                vehicle.getPurchaseDate(),
                lifecycleEvents.stream().map(VehicleLifecycleEventResponse::from).toList(),
                List.of());
    }
}
