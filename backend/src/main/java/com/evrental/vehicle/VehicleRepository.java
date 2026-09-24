package com.evrental.vehicle;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Nothing here filters by tenant. RLS does that on the transaction the
 * TenantFilter opened, and a hand-written tenant filter would be a second
 * mechanism to keep in step with the first.
 */
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {
}
