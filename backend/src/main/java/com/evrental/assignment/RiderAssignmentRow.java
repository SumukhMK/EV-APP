package com.evrental.assignment;

import java.time.LocalDate;

/**
 * One bike a rider has held, for the history panel on their profile.
 *
 * <p>The mirror of {@link AssignmentHistoryRow}, which answers the same
 * question from the bike's side. They are separate records because they name
 * opposite ends of the same row: a bike's history lists riders, a rider's
 * history lists bikes, and folding both into one record would mean half its
 * fields were null on each screen.
 *
 * <p>{@code vehicleId} is the registry id an operator reads, not a row id.
 * {@code endedOn} is null while the assignment is open, which is what makes
 * the current bike the first row of its own history rather than a special
 * case.
 */
public record RiderAssignmentRow(
        String vehicleId,
        LocalDate startedOn,
        LocalDate endedOn,
        int days,
        String reason,
        String returnCondition,
        String closedBy) {
}
