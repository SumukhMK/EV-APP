package com.evrental.service;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Closing a job: the last costing, and who pays for it.
 *
 * <p>liability is required by the record and by the database
 * (chk_sj_closed_has_liability). A job that closed without naming a payer is a
 * job the money module cannot act on, so it is not a state worth allowing.
 */
public record CloseServiceJobRequest(
        @Valid List<ServiceJobItemRequest> items,
        @NotNull(message = "Choose who pays before closing the job")
        ServiceLiability liability,
        @Size(max = 100, message = "Technician must be at most 100 characters")
        String technician,
        @Size(max = 2000, message = "Note must be at most 2000 characters")
        String note) {
}
