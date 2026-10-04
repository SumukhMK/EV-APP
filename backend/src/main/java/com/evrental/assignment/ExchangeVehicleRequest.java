package com.evrental.assignment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/**
 * The exchange form (screen 11), mirroring ExchangeVehicleRequest in
 * frontend/app/src/types/assignment.ts. Two events, never an overwrite: the
 * old assignment closes with a condition and the new one opens. riderId is
 * the rider code an operator reads, such as "R01".
 */
public record ExchangeVehicleRequest(
        @NotBlank String riderId,
        @NotBlank String fromVehicleId,
        @NotBlank String toVehicleId,
        @NotNull LocalDate occurredOn,
        @NotNull ExchangeReason reason,
        @NotNull com.evrental.service.DamageCategory returnCondition,
        @NotNull com.evrental.vehicle.VehicleState nextVehicleState,
        @Size(max = 500) String note,
        @NotNull @Valid List<DamageItem> damageItems) {
}