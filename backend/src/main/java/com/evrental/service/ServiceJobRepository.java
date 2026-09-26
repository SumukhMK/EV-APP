package com.evrental.service;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Service job rows. Every query here is already tenant-scoped by row-level
 * security, so none of them carries a tenant predicate -- adding one would
 * suggest the filter is the application's job, which is exactly the belief
 * V001 exists to remove.
 */
public interface ServiceJobRepository extends JpaRepository<ServiceJob, UUID> {

    /**
     * Locked for update, so two closes of the same job serialise rather than
     * both reading OPEN and both firing a charge.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from ServiceJob j where j.id = :id")
    Optional<ServiceJob> findByIdForUpdate(@Param("id") UUID id);

    /** The open job for a bike, if it has one. The partial index allows only one. */
    @Query("select j from ServiceJob j where j.vehicleId = :vehicleId and j.status <> 'CLOSED'")
    Optional<ServiceJob> findOpenForVehicle(@Param("vehicleId") UUID vehicleId);

    /**
     * The desk's list. Every filter is optional and a null means "do not
     * filter" -- the same reading the frontend's query builder gives a blank
     * field, so a cleared filter and an absent one behave alike.
     */
    @Query("""
           select j from ServiceJob j
           where (:status is null or j.status = :status)
             and (:queue is null or j.queue = :queue)
             and (:source is null or j.source = :source)
             and (:vehicleId is null or j.vehicleId = :vehicleId)
           """)
    Page<ServiceJob> search(@Param("status") ServiceJobStatus status,
                            @Param("queue") ServiceQueue queue,
                            @Param("source") ServiceJobSource source,
                            @Param("vehicleId") UUID vehicleId,
                            Pageable pageable);

    /** Open jobs per queue, for the dashboard strip. */
    @Query("""
           select j.queue, count(j) from ServiceJob j
           where j.status <> 'CLOSED'
           group by j.queue
           """)
    List<Object[]> countOpenByQueue();
}
