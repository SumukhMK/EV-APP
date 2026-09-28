/**
 * Money: what a rider owes, and what they have paid.
 *
 * <p>Stage S6 in docs/BUILD.md — owner: SMK. Half built. The charge ledger is
 * here: a service job that closes against a rider becomes a RiderCharge,
 * raised by an async listener on ServiceJobClosedEvent and guarded against
 * double-billing by a unique index on the job id.
 *
 * <p>The weekly payment run, the overdue list and receipts are not here, and
 * cannot be until S2 lands. Every one of them needs the rider's name, weekly
 * rent and billing day, and there is no rider table yet — which is why
 * RiderCharge.riderId is a bare UUID rather than a foreign key.
 *
 * <p>Money rows are never edited. Settling stamps a status and a date; a
 * correction is a new row.
 */
package com.evrental.payment;
