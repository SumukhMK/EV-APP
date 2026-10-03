package com.evrental.assignment;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Nothing here filters by tenant. RLS does that on the transaction the
 * TenantFilter opened, and a hand-written tenant filter would be a second
 * mechanism to keep in step with the first.
 */
public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    /**
     * The rider's current bike, if any. Written out rather than derived —
     * "Open" is not a Spring Data subject keyword, so findOpenByRiderId would
     * be parsed as a property named "open". The partial unique index makes
     * this at most one row.
     */
    @Query("select a from Assignment a where a.riderId = :riderId and a.endedOn is null")
    Optional<Assignment> findOpenByRiderId(@Param("riderId") UUID riderId);

    /** The bike's current rider, if any. Same reasoning, same index. */
    @Query("select a from Assignment a where a.vehicleId = :vehicleId and a.endedOn is null")
    Optional<Assignment> findOpenByVehicleId(@Param("vehicleId") UUID vehicleId);

    /** The open assignments of these bikes — the vehicle list's current-rider batch. */
    @Query("select a from Assignment a where a.endedOn is null and a.vehicleId in :vehicleIds")
    List<Assignment> findOpenByVehicleIdIn(@Param("vehicleIds") Collection<UUID> vehicleIds);

    /** The open assignments of these riders — the rider list's current-bike batch. */
    @Query("select a from Assignment a where a.endedOn is null and a.riderId in :riderIds")
    List<Assignment> findOpenByRiderIdIn(@Param("riderIds") Collection<UUID> riderIds);

    /** The bike's assignment history, newest first — the vehicle detail's assignments list. */
    List<Assignment> findByVehicleIdOrderByStartedOnDesc(UUID vehicleId);

    /**
     * Every bike this rider has held, newest first — open rows included.
     *
     * <p>The rider-side finders above all filter {@code endedOn is null},
     * because they answer "which bike now". This one deliberately does not:
     * the profile's history panel exists to show the bikes that have gone
     * back, which those finders can never see.
     */
    List<Assignment> findByRiderIdOrderByStartedOnDesc(UUID riderId);

    /** Every open assignment in the tenant. The read facade answers the derived fields from this. */
    List<Assignment> findByEndedOnIsNull();

    /** Closed rows nobody has settled. The partial index V014 adds serves this. */
    List<Assignment> findBySettlementApprovedOnIsNullAndEndedOnIsNotNullOrderByEndedOnDesc();

    /** Riders whose current bike is in the given state — the register's vehicleState filter. */
    @Query("""
            select a.riderId from Assignment a
            where a.endedOn is null
              and a.vehicleId in (select v.id from Vehicle v where v.state = :state)
            """)
    java.util.Set<UUID> riderIdsWhoseVehicleIsIn(@Param("state") com.evrental.vehicle.VehicleState state);
}