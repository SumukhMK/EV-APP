package com.evrental.service;

import java.util.UUID;

/**
 * Published when a job closes owing somebody money.
 *
 * <p>The money module (S6) listens and raises a RiderCharge. It rides the
 * async pool rather than the closing transaction because the charge only
 * matters at the next weekly payment run, days later, and a payment module
 * that is slow or briefly down must not stop a workshop releasing a bike.
 *
 * <p>Published after commit, never before: a charge for a close that then
 * rolled back is a rider billed for work that did not happen.
 *
 * <p>Carries the facts rather than the entity -- a listener on another thread
 * reading a JPA entity outside its session is a LazyInitializationException
 * waiting to happen.
 */
public record ServiceJobClosedEvent(
        UUID tenantId,
        UUID jobId,
        UUID vehicleId,
        UUID riderId,
        ServiceLiability liability,
        long totalCostPaise) {
}
