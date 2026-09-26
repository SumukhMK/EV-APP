package com.evrental.service;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One attempt at the QC gate.
 *
 * <p>A bike can be inspected many times -- fail, rework, inspect again -- so
 * this is a history, not a flag on the job. The verdict is stored rather than
 * derived from the checks, because the required set may grow later and a past
 * inspection must keep the verdict it was actually given.
 *
 * <p>checks is JSONB. A column per check would need a migration every time the
 * workshop adds one, and the backend validates the shape anyway (QcChecks), so
 * the flexibility costs nothing in correctness.
 */
@Entity
@Table(name = "qc_inspections")
public class QcInspection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Boolean> checks = new LinkedHashMap<>();

    @Column(nullable = false)
    private boolean passed;

    @Column(nullable = false)
    private String inspector;

    @Column
    private String notes;

    @CreationTimestamp
    @Column(name = "inspected_on", nullable = false, updatable = false)
    private Instant inspectedOn;

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }

    public UUID getJobId() {
        return jobId;
    }

    public void setJobId(UUID jobId) {
        this.jobId = jobId;
    }

    public UUID getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(UUID vehicleId) {
        this.vehicleId = vehicleId;
    }

    public Map<String, Boolean> getChecks() {
        return checks;
    }

    public void setChecks(Map<String, Boolean> checks) {
        this.checks = checks;
    }

    public boolean isPassed() {
        return passed;
    }

    public void setPassed(boolean passed) {
        this.passed = passed;
    }

    public String getInspector() {
        return inspector;
    }

    public void setInspector(String inspector) {
        this.inspector = inspector;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Instant getInspectedOn() {
        return inspectedOn;
    }
}
