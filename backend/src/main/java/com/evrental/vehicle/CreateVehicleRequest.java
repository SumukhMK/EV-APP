package com.evrental.vehicle;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record CreateVehicleRequest(
        @NotBlank(message = "Vehicle id is required")
        @Size(max = 20, message = "Vehicle id must be at most 20 characters")
        String id,
        @NotBlank(message = "Chassis number is required")
        @Size(max = 40, message = "Chassis number must be at most 40 characters")
        String chassisNumber,
        @NotBlank(message = "Model is required")
        @Size(max = 60, message = "Model must be at most 60 characters")
        String model,
        @NotBlank(message = "Battery type is required")
        String batteryType,
        @Size(max = 40, message = "Battery vendor must be at most 40 characters")
        String batteryVendor,
        @NotBlank(message = "Hub is required")
        @Size(max = 80, message = "Hub must be at most 80 characters")
        String hub,
        @Size(max = 20, message = "Registration number must be at most 20 characters")
        String registrationNumber,
        @NotNull(message = "Inducted on is required")
        LocalDate inductedOn) {
}
