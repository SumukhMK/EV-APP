package com.evrental.reference;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HubRepository extends JpaRepository<Hub, UUID> {

    List<Hub> findByActiveTrueOrderByNameAsc();

    @Query("select h from Hub h where lower(h.name) = lower(:name)")
    Optional<Hub> findByName(@Param("name") String name);
}
