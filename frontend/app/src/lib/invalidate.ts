import type { QueryClient } from '@tanstack/react-query';

/**
 * What to refetch after a write.
 *
 * There are two key families per resource — `['vehicles', …]` for the lists
 * and facets, `['vehicle', id]` for one record — and invalidating the plural
 * one does not touch the singular one. Getting that wrong is invisible until
 * someone opens a detail page they had already visited and reads a state the
 * bike left ten seconds ago, so the choice is made here once instead of at
 * every call site.
 */

/** A bike changed state or changed hands. */
export function invalidateVehicles(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['vehicles'] });
  qc.invalidateQueries({ queryKey: ['vehicle'] });
  // The QC queue and the inspectable list are both derived from vehicle state.
  qc.invalidateQueries({ queryKey: ['qc'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

/** A rider joined, changed status, or picked up or gave back a bike. */
export function invalidateRiders(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['riders'] });
  qc.invalidateQueries({ queryKey: ['rider'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

/**
 * An assignment event moves both sides at once, so both sides are refetched.
 * Assign, exchange and deboard all use this — they differ in what they send,
 * never in what they invalidate.
 */
export function invalidateAssignments(qc: QueryClient) {
  invalidateRiders(qc);
  invalidateVehicles(qc);
}
