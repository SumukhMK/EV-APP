package com.evrental.reference;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VehicleModelRepository extends JpaRepository<VehicleModel, UUID> {

    List<VehicleModel> findByActiveTrueOrderByNameAsc();

    @Query("select m from VehicleModel m where lower(m.name) = lower(:name)")
    Optional<VehicleModel> findByName(@Param("name") String name);
}
