package com.evrental.payment;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Collection rows. Tenant-scoped by row-level security, like everything else. */
public interface PaymentCollectionRepository extends JpaRepository<PaymentCollection, UUID> {

    /** Newest first — the receipt shows the most recent collection's method and date. */
    List<PaymentCollection> findByPeriodIdOrderByCollectedOnDesc(UUID periodId);

    /**
     * The same, across a whole page of periods. One query for the rider's
     * history panel rather than one per week.
     */
    List<PaymentCollection> findByPeriodIdInOrderByCollectedOnDesc(Collection<UUID> periodIds);

    /**
     * What has actually been collected against a period.
     *
     * <p>Always summed, never accumulated onto the stored figure. {@code
     * amount_paid = amount_paid + ?} loses a payment the moment two collections
     * overlap; this cannot, because it reads the rows themselves.
     */
    @Query("select coalesce(sum(c.amountPaise), 0) from PaymentCollection c where c.periodId = :periodId")
    long sumForPeriod(@Param("periodId") UUID periodId);
}
