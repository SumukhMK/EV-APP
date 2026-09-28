package com.evrental.assignment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The assign form (screen 10), mirroring AssignVehicleRequest in
 * frontend/app/src/types/assignment.ts. vehicleId is the registry id an
 * operator reads, such as "BLRSS0428".
 */
public record AssignVehicleRequest(
        @NotNull UUID riderId,
        @NotBlank String vehicleId,
        @NotNull LocalDate startedOn,
        @Size(max = 500) String note) {
}