package com.evrental.service;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QcInspectionRepository extends JpaRepository<QcInspection, UUID> {

    List<QcInspection> findByJobIdOrderByInspectedOnAsc(UUID jobId);
}
