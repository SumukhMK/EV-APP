package com.evrental.payment;

import com.evrental.service.ServiceLiability;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Charge rows. Tenant-scoped by row-level security, so no query here carries a
 * tenant predicate.
 */
public interface RiderChargeRepository extends JpaRepository<RiderCharge, UUID> {

    /** The guard against billing one repair twice. */
    boolean existsByServiceJobId(UUID serviceJobId);

    Optional<RiderCharge> findByServiceJobId(UUID serviceJobId);

    List<RiderCharge> findByRiderIdOrderByChargedOnDesc(UUID riderId);

    List<RiderCharge> findByRiderIdAndStatusOrderByChargedOnDesc(UUID riderId, RiderChargeStatus status);

    /** The open charges of many riders in one read, for a list's "owes" column. */
    List<RiderCharge> findByRiderIdInAndStatus(java.util.Collection<UUID> riderIds, RiderChargeStatus status);

    /**
     * Charges landing <em>in</em> a period — the run row's {@code serviceCharges}.
     *
     * <p>{@code liability = RIDER} is not an optimisation. A DEPOSIT charge is
     * settled against what is already held and never appears on a run; the
     * frontend contract states it outright. Dropping this predicate would bill
     * a rider twice for one dent — once here, once out of their deposit.
     */
    @Query("""
            select coalesce(sum(c.amountPaise), 0) from RiderCharge c
            where c.riderId = :riderId
              and c.status = com.evrental.payment.RiderChargeStatus.OPEN
              and c.liability = :liability
              and c.periodStart = :periodStart
            """)
    long sumOpenInPeriod(@Param("riderId") UUID riderId,
                         @Param("periodStart") LocalDate periodStart,
                         @Param("liability") ServiceLiability liability);

    /**
     * OPEN charges from <em>before</em> a period — the run row's {@code arrears}.
     *
     * <p>Money owed that carried forward rather than being paid in the week it
     * was charged. A SETTLED charge drops out here by the status predicate,
     * which is what stops a paid week from being billed again.
     */
    @Query("""
            select coalesce(sum(c.amountPaise), 0) from RiderCharge c
            where c.riderId = :riderId
              and c.status = com.evrental.payment.RiderChargeStatus.OPEN
              and c.liability = :liability
              and c.periodStart < :periodStart
            """)
    long sumOpenBefore(@Param("riderId") UUID riderId,
                       @Param("periodStart") LocalDate periodStart,
                       @Param("liability") ServiceLiability liability);

    /**
     * The charges a paid period has just cleared: everything OPEN and billable
     * on or before it. Settled together when the week reads PAID, so they stop
     * counting as arrears against the next one.
     */
    @Query("""
            select c from RiderCharge c
            where c.riderId = :riderId
              and c.status = com.evrental.payment.RiderChargeStatus.OPEN
              and c.liability = :liability
              and c.periodStart <= :periodStart
            """)
    List<RiderCharge> findOpenUpTo(@Param("riderId") UUID riderId,
                                   @Param("periodStart") LocalDate periodStart,
                                   @Param("liability") ServiceLiability liability);
}
