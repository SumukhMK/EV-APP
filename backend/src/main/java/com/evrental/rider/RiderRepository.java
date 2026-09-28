package com.evrental.rider;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Nothing here filters by tenant. RLS does that on the transaction the
 * TenantFilter opened, and a hand-written tenant filter would be a second
 * mechanism to keep in step with the first.
 */
public interface RiderRepository extends JpaRepository<Rider, UUID> {

    /**
     * Written out, not derived. Spring Data renders ...IgnoreCase as
     * UPPER(col) = UPPER(?), which cannot use an index. RLS scopes this to the
     * caller's tenant, so no tenant_id here — the unique index on
     * (tenant_id, phone) is the real guarantee and this check only exists to
     * name the field in a 409.
     */
    @Query("select r from Rider r where lower(r.phone) = lower(:phone)")
    Optional<Rider> findByPhone(@Param("phone") String phone);

    /**
     * The list. Every parameter is optional and a null means "do not filter" —
     * written as `(:param is null or ...)` so one query serves every
     * combination, the same shape as VehicleRepository.search.
     *
     * <p>q is matched against every column the row prints, because that is what
     * a search box appears to promise. The caller passes it already lowercased
     * and wrapped in % signs. The mock also matches the rider id, but live ids
     * are UUIDs nobody types, so id is deliberately not searched.
     */
    @Query("""
            select r from Rider r
            where (:status is null or r.status = :status)
              and (:platform is null or lower(r.platform) = :platform)
              and (:q is null
                   or lower(r.name) like :q
                   or lower(r.phone) like :q
                   or lower(r.platform) like :q)
            """)
    Page<Rider> search(@Param("q") String q,
                       @Param("status") RiderStatus status,
                       @Param("platform") String platform,
                       Pageable pageable);

    /**
     * Facet counts. Deliberately takes no status parameter: the chips are
     * counted over the search but never over the status filter, or filtering
     * to ACTIVE would show every other chip at zero and the chips would fight
     * the user. Same rule as VehicleRepository.countByState.
     */
    @Query("""
            select r.status, count(r) from Rider r
            where (:platform is null or lower(r.platform) = :platform)
              and (:q is null
                   or lower(r.name) like :q
                   or lower(r.phone) like :q
                   or lower(r.platform) like :q)
            group by r.status
            """)
    List<Object[]> countByStatus(@Param("q") String q,
                                 @Param("platform") String platform);

    /**
     * Riders a bike can be assigned to. Deliberately not filtered on KYC —
     * whether a bike may go out to a rider whose documents are still pending
     * is a rule nobody has stated, and guessing "no" would strand every rider
     * the onboarding screen creates. Same reasoning as the mock's
     * listAssignableRiders.
     */
    List<Rider> findByStatus(RiderStatus status);
}