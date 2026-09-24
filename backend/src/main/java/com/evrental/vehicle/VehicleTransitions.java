package com.evrental.vehicle;

import java.util.UUID;

/**
 * The one method the service module (S4) calls, published as an interface so
 * the handshake WORK_SPLIT.md names is literally one method wide -- S4 depends
 * on this, not on VehicleService, and cannot reach the rest of the registry by
 * accident.
 *
 * <p>The caller is expected to already be inside a transaction. S4 calls this
 * from its own @Transactional method and the two changes commit together: a
 * service job that opened while the bike failed to move into UNDER_REPAIR
 * would be a job on a bike that is still out with a rider.
 */
public interface VehicleTransitions {

    /**
     * Moves a vehicle to a new state, recording it in the lifecycle log.
     *
     * @param actorName the actor's name at this moment, frozen into the log
     * @throws com.evrental.common.NotFoundException if no such vehicle exists in this tenant
     * @throws com.evrental.common.ConflictException if the transition table forbids the move
     */
    Vehicle transitionState(UUID vehicleId, VehicleState toState, String note,
                            UUID actorUserId, String actorName);
}
