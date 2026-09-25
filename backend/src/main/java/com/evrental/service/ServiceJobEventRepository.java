package com.evrental.service;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The activity log. Insert and read only -- nothing in the module calls
 * delete or updates a loaded row, because the log is append-only by design.
 */
public interface ServiceJobEventRepository extends JpaRepository<ServiceJobEvent, UUID> {

    List<ServiceJobEvent> findByJobIdOrderByOccurredOnAsc(UUID jobId);
}
