package com.evrental.payment;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Frozen period rows. Nothing here carries a tenant predicate — row-level
 * security does that on the transaction the TenantFilter opened, and a
 * hand-written tenant filter would be a second mechanism to keep in step with
 * the first.
 */
public interface PaymentPeriodRepository extends JpaRepository<PaymentPeriod, UUID> {

    /** One run: the riders in a cycle, for one week. */
    List<PaymentPeriod> findByPeriodStartAndBillingDayOrderByRiderIdAsc(
            LocalDate periodStart, com.evrental.rider.BillingDay billingDay);

    Optional<PaymentPeriod> findByRiderIdAndPeriodStart(UUID riderId, LocalDate periodStart);

    /** The rider profile's payment history panel, newest week first. */
    List<PaymentPeriod> findByRiderIdOrderByPeriodStartDesc(UUID riderId);

    /**
     * The same read for a page of riders, in one query.
     *
     * <p>The register's list screen needs each rider's current standing, and
     * one query per row is a query per row.
     */
    List<PaymentPeriod> findByRiderIdInOrderByPeriodStartDesc(Collection<UUID> riderIds);

    /**
     * Every week that closed while still short, newest first.
     *
     * <p>Filtered on the numbers rather than on {@code status}, deliberately.
     * A row generated on Monday is stored PENDING and only becomes overdue by
     * the passage of time; nothing writes to it in between, because there is
     * no scheduler. Reading the stored enum would therefore miss every row
     * that went overdue quietly.
     */
    @Query("""
            select p from PaymentPeriod p
            where p.periodEnd < :today
              and p.amountPaidPaise < p.totalDuePaise
            order by p.periodEnd asc
            """)
    List<PaymentPeriod> findOverdue(@Param("today") LocalDate today);

    /**
     * The period, locked for the length of the collection's transaction.
     *
     * <p>{@code PESSIMISTIC_WRITE} is what makes two people recording cash at
     * the same counter safe: the second one waits, then re-reads the sum of
     * collections with the first one's row already in it. Without the lock
     * both read the same total and one payment disappears.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentPeriod p where p.riderId = :riderId and p.periodStart = :periodStart")
    Optional<PaymentPeriod> findForUpdate(@Param("riderId") UUID riderId,
                                          @Param("periodStart") LocalDate periodStart);
}
