/**
 * The assignment module (stage S5 in docs/BUILD.md — owner: Abhiram).
 *
 * <p>Who has which bike, and the three recorded events that change it: assign,
 * exchange, deboard. The open assignment row is the single source of truth for
 * the derived fields the entities deliberately do not store — a rider's
 * currentVehicleId and a bike's currentRiderId/currentRiderName — and
 * {@link AssignmentQuery} is the read facade the rider and vehicle modules
 * inject for exactly those fields.
 *
 * <p>Every return routes the bike through the S4 facade
 * ({@link com.evrental.service.ServiceJobFacade#openJob}), so a damaged bike
 * cannot skip the workshop; every bike move goes through
 * {@link com.evrental.vehicle.VehicleTransitions#transitionState}, so the
 * lifecycle log stays complete; and the rider's status door is
 * {@link com.evrental.rider.RiderService#markDeboarded}. The settlement money
 * a deboard records is a fact on the assignment row — the ledger rows are S6's
 * second half, under FA approval (RBAC.md conflict #4).
 */
package com.evrental.assignment;