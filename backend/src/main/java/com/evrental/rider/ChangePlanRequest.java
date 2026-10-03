package com.evrental.rider;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/** The rider's new weekly rent, in paise. */
public record ChangePlanRequest(
        @NotNull(message = "A weekly plan is required")
        @PositiveOrZero(message = "A weekly plan cannot be negative")
        Long planAmount) {
}
