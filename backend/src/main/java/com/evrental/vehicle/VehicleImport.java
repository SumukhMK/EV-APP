package com.evrental.vehicle;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "vehicle_imports")
public class VehicleImport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    @CreationTimestamp
    @Column(name = "uploaded_on", nullable = false, updatable = false)
    private Instant uploadedOn;

    @Column(name = "committed_on")
    private Instant committedOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VehicleImportStatus status;

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public UUID getUploadedBy() {
        return uploadedBy;
    }

    public void setUploadedBy(UUID uploadedBy) {
        this.uploadedBy = uploadedBy;
    }

    public Instant getUploadedOn() {
        return uploadedOn;
    }

    public Instant getCommittedOn() {
        return committedOn;
    }

    public void setCommittedOn(Instant committedOn) {
        this.committedOn = committedOn;
    }

    public VehicleImportStatus getStatus() {
        return status;
    }

    public void setStatus(VehicleImportStatus status) {
        this.status = status;
    }
}
