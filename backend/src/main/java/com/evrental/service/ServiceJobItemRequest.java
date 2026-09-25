package com.evrental.service;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * One cost line as the desk sends it. `kind` is optional and defaults to
 * OTHER, matching the frontend type where it is `kind?`.
 */
public record ServiceJobItemRequest(
        @NotBlank(message = "Every cost line needs a label")
        @Size(max = 200, message = "A cost line label must be at most 200 characters")
        String label,
        @PositiveOrZero(message = "A cost cannot be negative")
        long costPaise,
        ServiceJobItemKind kind) {

    public ServiceJobItemKind kindOrDefault() {
        return kind == null ? ServiceJobItemKind.OTHER : kind;
    }
}
