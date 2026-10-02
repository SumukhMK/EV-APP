package com.evrental.vehicle;

import com.evrental.assignment.AssignmentHistoryRow;
import com.evrental.assignment.CurrentRider;
import java.time.LocalDate;
import java.util.List;

/**
 * A vehicle plus its lifecycle history and its assignment history. The
 * assignments list is answered from the open and closed assignment rows (S5),
 * newest first.
 */
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
        List<AssignmentHistoryRow> assignments) {

    /**
     * @param currentRider the rider on the bike now, or null if nobody is.
     *                     Passed in rather than read here for the same reason
     *                     the list path passes it: the rider is a property of
     *                     the open assignment row, which {@code assignment/}
     *                     owns, and a response record does not query.
     *                     <p>This used to be a literal {@code null, null}, so
     *                     the fleet list named the rider and the detail page
     *                     one click later said the bike had nobody on it. The
     *                     mock derived both from one fixture, so the
     *                     disagreement only existed in a live build.
     */
    public static VehicleDetailResponse from(Vehicle vehicle, List<VehicleLifecycleEvent> lifecycleEvents,
                                             List<AssignmentHistoryRow> assignments,
                                             CurrentRider currentRider) {
        return new VehicleDetailResponse(
                vehicle.getRegistryId(),
                vehicle.getChassisNumber(),
                vehicle.getModel(),
                vehicle.getBatteryType(),
                vehicle.getBatteryVendor(),
                vehicle.getHub(),
                vehicle.getState(),
                currentRider == null ? null : currentRider.id(),
                currentRider == null ? null : currentRider.name(),
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
                assignments);
    }
}
