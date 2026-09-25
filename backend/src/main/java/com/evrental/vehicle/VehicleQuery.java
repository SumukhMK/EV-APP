package com.evrental.vehicle;

public record VehicleQuery(
        String q,
        VehicleState state,
        String hub,
        String make,
        String batteryType) {
}
