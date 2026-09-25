package com.evrental.vehicle;

import java.time.Instant;

public record VehicleLifecycleEventResponse(
        VehicleState state,
        Instant occurredOn,
        String note,
        String actor) {

    public static VehicleLifecycleEventResponse from(VehicleLifecycleEvent event) {
        return new VehicleLifecycleEventResponse(
                event.getToState(), event.getOccurredOn(), event.getNote(), event.getActorName());
    }
}
