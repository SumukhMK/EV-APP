package com.evrental.service;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * Opening a job, from a deboard, an RSA or QRT callout, a walk-in or a
 * routine inspection.
 *
 * <p>vehicleId is the registry id an operator reads -- "BLRSS0428" -- not the
 * row's UUID, matching VehicleResponse.id and the frontend contract.
 *
 * <p>queue is optional: leave it out and the damage category decides, which is
 * what every screen does today.
 */
public record CreateServiceJobRequest(
        @NotBlank(message = "Vehicle id is required")
        @Size(max = 20, message = "Vehicle id must be at most 20 characters")
        String vehicleId,
        UUID riderId,
        @NotNull(message = "Source is required")
        ServiceJobSource source,
        @NotNull(message = "Damage category is required")
        DamageCategory damageCategory,
        @Size(max = 2000, message = "Damage notes must be at most 2000 characters")
        String damageNotes,
        ServiceQueue queue,
        @Size(max = 100, message = "Location must be at most 100 characters")
        String location,
        @Size(max = 100, message = "Reference must be at most 100 characters")
        String reference) {
}
