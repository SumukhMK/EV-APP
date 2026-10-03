/**
 * The audit trail, assembled from the records that already exist.
 *
 * <p>There is deliberately no {@code audit_events} table and no write path.
 * Every line this module shows is already recorded somewhere, by the code that
 * performed the act: a bike's state changes are in
 * {@code vehicle_lifecycle_events}, a rider taking or returning a bike is the
 * assignment row itself, money is {@code payment_collections}, workshop
 * movements are {@code service_job_events}.
 *
 * <p>A separate audit table would mean every one of those actions writing
 * twice, which is two chances to disagree and one of them silent. A trail that
 * can drift from the thing it describes is worse than none, because it is
 * believed. Reading the records directly means the audit log cannot be wrong
 * unless the data is, and a missing line means the act did not happen.
 *
 * <p>The cost is honest and worth stating: this module can only show what the
 * modules already record. A plan change or a role change leaves no row today,
 * so neither appears here. The fix for that is to record it where it happens,
 * not to start a parallel ledger.
 */
package com.evrental.audit;
