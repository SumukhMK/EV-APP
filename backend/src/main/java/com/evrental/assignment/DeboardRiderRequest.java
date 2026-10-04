package com.evrental.assignment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/**
 * The deboard form (screen 12), mirroring DeboardRiderRequest in
 * frontend/app/src/types/assignment.ts. Money is paise, like every other
 * amount on the wire — the form converts rupees at the edge. riderId is the
 * rider code an operator reads, such as "R01".
 */
public record DeboardRiderRequest(
        @NotBlank String riderId,
        @NotBlank String vehicleId,
        @NotNull LocalDate returnedOn,
        @NotNull com.evrental.service.DamageCategory returnCondition,
        @NotNull DeboardReason reason,
        @NotNull com.evrental.vehicle.VehicleState nextVehicleState,
        @NotNull @PositiveOrZero Long outstandingRent,
        @NotNull @PositiveOrZero Long depositRefund,
        @Size(max = 500) String note,
        @NotNull @Valid List<DamageItem> damageItems) {
}