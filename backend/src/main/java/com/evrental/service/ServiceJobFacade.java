package com.evrental.service;

import java.util.UUID;

/**
 * The one method the assignment module (S5) calls, and the only handshake
 * between the two people building this backend (WORK_SPLIT.md).
 *
 * <p>A deboard or an exchange that finds damage needs a service job opened.
 * Abhiram's code injects this interface and calls {@link #openJob}; it never
 * imports anything else from this package, so the whole coupling between the
 * two modules is one signature. If that signature has to change, it is a
 * conversation rather than an edit.
 *
 * <p>The caller is expected to already be inside a transaction: the job, the
 * bike's state change and the deboard that triggered them commit together, or
 * none of them do.
 */
public interface ServiceJobFacade {

    /**
     * Opens a job and moves the bike into the queue the damage implies.
     *
     * @param vehicleId   the registry id an operator reads, such as "BLRSS0428"
     * @param riderId     the rider handing the bike back, or null for a walk-in
     * @param actor       the operator's name, frozen into the activity log
     * @throws com.evrental.common.NotFoundException if the bike is not this tenant's
     * @throws com.evrental.common.ConflictException if the bike already has an open job,
     *                                               or is in a state that cannot enter service
     */
    ServiceJob openJob(UUID tenantId, String vehicleId, UUID riderId, ServiceJobSource source,
                       DamageCategory damage, String damageNotes, String actor);

    /** The bike's open job, if it is in the workshop right now. */
    java.util.Optional<ServiceJob> openJobFor(String vehicleId);

    /**
     * A rider handed back a bike that is already in the workshop. No second
     * job is opened and the bike stays where it is; the return is written on
     * the open job's activity log, and the job keeps (or takes) the rider as
     * the person it concerns.
     */
    void recordReturnOnOpenJob(UUID jobId, UUID riderId, ServiceJobSource source,
                               DamageCategory condition, String damageNotes, String actor);
}
