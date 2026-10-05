package com.evrental.assignment;

import com.evrental.vehicle.VehicleState;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The read side of the assignment module, published as an interface so the
 * rider and vehicle modules can answer the derived fields the entities
 * deliberately do not store — a rider's currentVehicleId, a bike's
 * currentRiderId/currentRiderName and its assignment history — without
 * reaching into this package's internals. The same pattern as
 * ServiceJobFacade: one signature wide, and a change is a conversation.
 *
 * <p>Every method is tenant-scoped by RLS on the caller's transaction.
 */
public interface AssignmentQuery {

    /** The rider on this bike, or null if the bike has no open assignment. */
    CurrentRider currentRiderOf(UUID vehicleId);

    /** The riders on these bikes, keyed by vehicle id. Bikes with no open assignment are absent. */
    Map<UUID, CurrentRider> currentRidersOf(Collection<UUID> vehicleIds);

    /** The bike's assignment history, newest first. */
    List<AssignmentHistoryRow> historyFor(UUID vehicleId);

    /**
     * The rider's assignment history, newest first — the same rows from the
     * other end. Without it a closed assignment is readable from the bike and
     * invisible from the person who handed it back.
     */
    List<RiderAssignmentRow> historyForRider(UUID riderId);

    /** The registry id of the bike this rider holds, or null. */
    String currentVehicleIdOf(UUID riderId);

    /** The registry ids of the bikes these riders hold, keyed by rider id. Riders with no bike are absent. */
    Map<UUID, String> currentVehicleIdsOf(Collection<UUID> riderIds);

    /** Riders with an open assignment — the ones an exchange or deboard can act on. */
    Set<UUID> riderIdsHoldingBikes();

    /** The rider holding this bike right now, by row id; empty when nobody does. */
    java.util.Optional<UUID> riderIdHolding(UUID vehicleId);

    /** Riders whose current bike is in the given state — the register's vehicleState filter. */
    Set<UUID> riderIdsWhoseVehicleIsIn(VehicleState state);
}