package com.evrental.assignment;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A deboard's money facts, and whether anyone has acted on them.
 *
 * <p>These sat on the closing assignment row with no way to approve them, so
 * the ledger said nothing about any settlement that had ever happened.
 */
public record SettlementResponse(
        String assignmentId,
        String riderId,
        String riderName,
        String vehicleId,
        LocalDate endedOn,
        long outstandingRent,
        long depositRefund,
        String approvedBy,
        Instant approvedOn) {
}
