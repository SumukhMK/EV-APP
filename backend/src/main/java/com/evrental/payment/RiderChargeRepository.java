package com.evrental.payment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
