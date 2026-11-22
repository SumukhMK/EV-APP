package com.evrental.payment;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Payment rows. Tenant-scoped by row-level security, like everything else. */
public interface PaymentCollectionRepository extends JpaRepository<PaymentCollection, UUID> {

    /** Everything one rider has paid, and every reversal, oldest first. */
    List<PaymentCollection> findByRiderIdOrderByCollectedOnAsc(UUID riderId);

    /** One day's payments and reversals, for the end-of-day count. */
    List<PaymentCollection> findByCollectedOnGreaterThanEqualAndCollectedOnLessThanOrderByCollectedOnDesc(
            Instant from, Instant to);

    /** A payment the screen already sent once: a double tap, or a retry. */
    Optional<PaymentCollection> findByClientKey(String clientKey);

    Optional<PaymentCollection> findByReversesId(UUID reversesId);
}
