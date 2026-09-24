package com.evrental.vehicle;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateVehicleRequest(
        @NotBlank(message = "Make is required")
        @Size(max = 60, message = "Make must be at most 60 characters")
        String make,
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
        @Size(max = 40, message = "Motor number must be at most 40 characters")
        String motorNumber,
        @Size(max = 40, message = "Controller number must be at most 40 characters")
        String controllerNumber,
        @Size(max = 40, message = "RFID tag must be at most 40 characters")
        String rfidTag) {
}
