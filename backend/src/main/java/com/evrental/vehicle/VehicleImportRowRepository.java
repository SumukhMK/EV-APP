package com.evrental.vehicle;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleImportRowRepository extends JpaRepository<VehicleImportRow, UUID> {

    List<VehicleImportRow> findByImportIdOrderByRowNumberAsc(UUID importId);
}
