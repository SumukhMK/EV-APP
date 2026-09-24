package com.evrental.vehicle;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Nothing here filters by tenant. RLS does that on the transaction the
 * TenantFilter opened, and a hand-written tenant filter would be a second
 * mechanism to keep in step with the first.
 */
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

    /**
     * The vehicle row, locked for update. transitionState() is read-check-write,
     * and two staff moving one bike at once would otherwise both read DEPLOYED,
     * both pass the check and both write -- two lifecycle rows for one real
     * move, with the losing update landing on top. Same defect class as the S0
     * refresh-token rotation.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Vehicle v where v.id = :id")
    Optional<Vehicle> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Written out, not derived. Spring Data renders ...IgnoreCase as
     * UPPER(col) = UPPER(?), which cannot use idx_vehicles_registry.
     * RLS scopes this to the caller's tenant, so no tenant_id here.
     */
    @Query("select v from Vehicle v where lower(v.registryId) = lower(:registryId)")
    Optional<Vehicle> findByRegistryId(@Param("registryId") String registryId);

    @Query("select v from Vehicle v where lower(v.chassisNumber) = lower(:chassisNumber)")
    Optional<Vehicle> findByChassisNumber(@Param("chassisNumber") String chassisNumber);
}
