package com.evrental.service;

import com.evrental.vehicle.VehicleState;
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

/**
 * One line of a job's activity log.
 *
 * <p>Append-only, like the audit log and for the same reason: a correction is
 * a new row. There is no setter for occurredOn and no update path anywhere in
 * the module -- a log that can be edited answers a different question from the
 * one anybody asks it.
 *
 * <p>Each row carries the queue and the bike state *at the time*, so reading
 * the log back does not require replaying every rule that has since changed.
 */
@Entity
@Table(name = "service_job_events")
public class ServiceJobEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceQueue queue;

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_state", nullable = false)
    private VehicleState vehicleState;

    @Column(nullable = false)
    private String actor;

    @Column(nullable = false)
    private String note = "";

    @CreationTimestamp
    @Column(name = "occurred_on", nullable = false, updatable = false)
    private Instant occurredOn;

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

    public ServiceQueue getQueue() {
        return queue;
    }

    public void setQueue(ServiceQueue queue) {
        this.queue = queue;
    }

    public VehicleState getVehicleState() {
        return vehicleState;
    }

    public void setVehicleState(VehicleState vehicleState) {
        this.vehicleState = vehicleState;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getOccurredOn() {
        return occurredOn;
    }
}
