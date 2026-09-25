package com.evrental.service;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceJobItemRepository extends JpaRepository<ServiceJobItem, UUID> {

    List<ServiceJobItem> findByJobId(UUID jobId);

    void deleteByJobId(UUID jobId);
}
