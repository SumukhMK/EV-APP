package com.evrental.platform;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    /**
     * Written out rather than derived, for the same reason as
     * {@code UserRepository.findByEmailIgnoreCase}: V001 indexes
     * {@code lower(slug)}, and the derived form would render
     * {@code UPPER(slug) = UPPER(?)} and miss it.
     */
    @Query("select t from Tenant t where lower(t.slug) = lower(:slug)")
    Optional<Tenant> findBySlugIgnoreCase(@Param("slug") String slug);
}
