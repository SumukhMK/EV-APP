package com.evrental.rider;

import com.evrental.vehicle.VehicleState;

/**
 * The list filters, mirroring RiderQuery in frontend/app/src/lib/api/riders.ts.
 *
 * <p>vehicleState is accepted for contract parity but matches nothing until
 * S5 owns assignments: no rider holds a bike, so a rider whose vehicle is in
 * a given state does not exist. The service short-circuits to an empty page
 * rather than ignoring the filter or erroring.
 */
public record RiderQuery(String q, RiderStatus status, String platform, VehicleState vehicleState) {}