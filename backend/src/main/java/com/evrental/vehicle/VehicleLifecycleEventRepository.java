package com.evrental.vehicle;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleLifecycleEventRepository extends JpaRepository<VehicleLifecycleEvent, UUID> {

    /** Oldest first, which is the order the detail screen renders. */
    List<VehicleLifecycleEvent> findByVehicleIdOrderByOccurredOnAsc(UUID vehicleId);
}
