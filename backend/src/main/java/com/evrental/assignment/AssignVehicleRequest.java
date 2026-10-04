package com.evrental.assignment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * The assign form (screen 10), mirroring AssignVehicleRequest in
 * frontend/app/src/types/assignment.ts. vehicleId is the registry id an
 * operator reads, such as "BLRSS0428"; riderId is the rider code an operator
 * reads, such as "R01".
 */
public record AssignVehicleRequest(
        @NotBlank String riderId,
        @NotBlank String vehicleId,
        @NotNull LocalDate startedOn,
        @Size(max = 500) String note) {
}