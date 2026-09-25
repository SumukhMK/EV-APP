package com.evrental.service;

import com.evrental.vehicle.VehicleState;
import java.time.Instant;

/** One activity line, matching ServiceJobEvent in the frontend contract. */
public record ServiceJobEventResponse(
        Instant occurredOn,
        String actor,
        ServiceQueue queue,
        VehicleState vehicleState,
        String note) {

    public static ServiceJobEventResponse from(ServiceJobEvent event) {
        return new ServiceJobEventResponse(
                event.getOccurredOn(), event.getActor(), event.getQueue(),
                event.getVehicleState(), event.getNote());
    }
}
