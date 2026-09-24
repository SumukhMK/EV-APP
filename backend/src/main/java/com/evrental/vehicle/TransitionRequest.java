package com.evrental.vehicle;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** What the state-change control on the detail screen sends. */
public record TransitionRequest(
        @NotNull VehicleState toState,
        @Size(max = 500) String note) {
}
