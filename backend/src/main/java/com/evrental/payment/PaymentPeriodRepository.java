package com.evrental.payment;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Frozen period rows. Nothing here carries a tenant predicate — row-level
 * security does that on the transaction the TenantFilter opened, and a
 * hand-written tenant filter would be a second mechanism to keep in step with
 * the first.
 */
public interface PaymentPeriodRepository extends JpaRepository<PaymentPeriod, UUID> {

    Optional<PaymentPeriod> findByRiderIdAndPeriodStart(UUID riderId, LocalDate periodStart);

    @Query("select p from PaymentPeriod p where p.riderId in :riderIds and p.periodStart in :periodStarts")
    List<PaymentPeriod> findByRiderIdInAndPeriodStartInOrderByRiderIdAsc(
            @Param("riderIds") Collection<UUID> riderIds,
            @Param("periodStarts") Collection<LocalDate> periodStarts);

    /** A rider's billed weeks, newest first. */
    List<PaymentPeriod> findByRiderIdOrderByPeriodStartDesc(UUID riderId);




}
