package com.evrental.service;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * A working save from the assistance desk.
 *
 * <p>items is the whole list, not a patch: the desk edits a table and saves it.
 * A null list leaves the existing lines alone, which is how a note-only save
 * avoids wiping the costing someone else just entered.
 */
public record UpdateServiceJobRequest(
        @NotNull(message = "Queue is required")
        ServiceQueue queue,
        @NotNull(message = "Damage category is required")
        DamageCategory damageCategory,
        @Size(max = 4000, message = "Work summary must be at most 4000 characters")
        String workSummary,
        @Valid List<ServiceJobItemRequest> items,
        @Size(max = 100, message = "Technician must be at most 100 characters")
        String technician,
        @Size(max = 100, message = "Reference must be at most 100 characters")
        String reference,
        @Size(max = 2000, message = "Note must be at most 2000 characters")
        String note) {
}
