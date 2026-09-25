package com.evrental.service;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;

/**
 * One QC attempt. The nine checks are validated in the service rather than
 * here, because "which ones are missing" is a better message than "invalid",
 * and Bean Validation cannot name them.
 */
public record SubmitQcRequest(
        @NotNull(message = "The QC checks are required")
        Map<String, Boolean> checks,
        @NotBlank(message = "Inspector is required")
        @Size(max = 100, message = "Inspector must be at most 100 characters")
        String inspector,
        @Size(max = 2000, message = "Notes must be at most 2000 characters")
        String notes) {
}
