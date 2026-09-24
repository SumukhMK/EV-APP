package com.evrental.vehicle;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /**
     * The list. Every parameter is optional and a null means "do not filter" --
     * written as `(:param is null or ...)` so one query serves every
     * combination rather than building a Specification for each.
     *
     * <p>q is matched against every column the row prints, because that is what
     * a search box appears to promise. The caller passes it already lowercased
     * and wrapped in % signs.
     */
    @Query("""
            select v from Vehicle v
            where (:state is null or v.state = :state)
              and (:hub is null or lower(v.hub) = lower(:hub))
              and (:make is null or lower(v.make) = lower(:make))
              and (:batteryType is null or lower(v.batteryType) = lower(:batteryType))
              and (:q is null
                   or lower(v.registryId) like :q
                   or lower(v.chassisNumber) like :q
                   or lower(v.model) like :q
                   or lower(v.make) like :q
                   or lower(v.hub) like :q
                   or lower(v.batteryType) like :q
                   or lower(coalesce(v.batteryVendor, '')) like :q)
            """)
    Page<Vehicle> search(@Param("q") String q,
                         @Param("state") VehicleState state,
                         @Param("hub") String hub,
                         @Param("make") String make,
                         @Param("batteryType") String batteryType,
                         Pageable pageable);

    /**
     * Facet counts. Deliberately takes no state parameter: the chips are
     * counted over the search but never over the state filter, or filtering to
     * DEPLOYED would show every other chip at zero and the chips would fight
     * the user.
     */
    @Query("""
            select v.state, count(v) from Vehicle v
            where (:hub is null or lower(v.hub) = lower(:hub))
              and (:make is null or lower(v.make) = lower(:make))
              and (:batteryType is null or lower(v.batteryType) = lower(:batteryType))
              and (:q is null
                   or lower(v.registryId) like :q
                   or lower(v.chassisNumber) like :q
                   or lower(v.model) like :q
                   or lower(v.make) like :q
                   or lower(v.hub) like :q
                   or lower(v.batteryType) like :q
                   or lower(coalesce(v.batteryVendor, '')) like :q)
            group by v.state
            """)
    List<Object[]> countByState(@Param("q") String q,
                                @Param("hub") String hub,
                                @Param("make") String make,
                                @Param("batteryType") String batteryType);

    @Query("select distinct v.make from Vehicle v order by v.make")
    List<String> distinctMakes();

    @Query("select distinct v.batteryType from Vehicle v order by v.batteryType")
    List<String> distinctBatteryTypes();
}
