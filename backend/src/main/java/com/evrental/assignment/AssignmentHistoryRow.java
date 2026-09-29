package com.evrental.assignment;

import java.time.LocalDate;

/**
 * One row of a bike's assignment history, mirroring AssignmentHistoryRow in
 * frontend/app/src/types/vehicle.ts field for field. Money is paise, like
 * every other amount on the wire.
 */
public record AssignmentHistoryRow(
        String riderId,
        String riderName,
        long planAmount,
        LocalDate startedOn,
        LocalDate endedOn,
        int days,
        String closedBy) {
}