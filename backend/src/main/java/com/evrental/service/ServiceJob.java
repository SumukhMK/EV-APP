package com.evrental.service;

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
import org.hibernate.annotations.UpdateTimestamp;

/**
 * One visit to the workshop.
 *
 * <p>A deboard's damage tag, an RSA call, a QRT callout, a walk-in and a
 * routine inspection all become this record. It carries where the bike is
 * (queue), how bad it was (damageCategory), what was done (workSummary), what
 * it cost (totalCostPaise) and, once closed, who pays (liability).
 *
 * <p>vehicleId is the vehicles table's UUID, not the registry id an operator
 * reads. The registry id is put back on the wire in ServiceJobResponse; see
 * V006's header for why the column is a real foreign key.
 *
 * <p>Nothing here writes the bike's state. ServiceJobService routes every such
 * change through VehicleTransitions.transitionState(), which is the only door.
 */
@Entity
@Table(name = "service_jobs")
public class ServiceJob {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    /** Null for a walk-in or a routine inspection: not every job has a rider. */
    @Column(name = "rider_id")
    private UUID riderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceJobSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "damage_category", nullable = false)
    private DamageCategory damageCategory;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceQueue queue;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceJobStatus status = ServiceJobStatus.OPEN;

    /** Null until the job closes. Deciding it is what closing means. */
    @Enumerated(EnumType.STRING)
    @Column
    private ServiceLiability liability;

    @Column(name = "work_summary", nullable = false)
    private String workSummary = "";

    @Column(name = "damage_notes")
    private String damageNotes;

    /** Where the bike was picked up. RSA and QRT only. */
    @Column
    private String location;

    /** An insurance or warranty claim number, when the queue needs one. */
    @Column
    private String reference;

    @Column
    private String technician;

    @Column(name = "total_cost_paise", nullable = false)
    private long totalCostPaise;

    @CreationTimestamp
    @Column(name = "created_on", nullable = false, updatable = false)
    private Instant createdOn;

    @Column(name = "closed_on")
    private Instant closedOn;

    @UpdateTimestamp
    @Column(name = "updated_on", nullable = false)
    private Instant updatedOn;

    public boolean isClosed() {
        return status == ServiceJobStatus.CLOSED;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }

    public UUID getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(UUID vehicleId) {
        this.vehicleId = vehicleId;
    }

    public UUID getRiderId() {
        return riderId;
    }

    public void setRiderId(UUID riderId) {
        this.riderId = riderId;
    }

    public ServiceJobSource getSource() {
        return source;
    }

    public void setSource(ServiceJobSource source) {
        this.source = source;
    }

    public DamageCategory getDamageCategory() {
        return damageCategory;
    }

    public void setDamageCategory(DamageCategory damageCategory) {
        this.damageCategory = damageCategory;
    }

    public ServiceQueue getQueue() {
        return queue;
    }

    public void setQueue(ServiceQueue queue) {
        this.queue = queue;
    }

    public ServiceJobStatus getStatus() {
        return status;
    }

    public void setStatus(ServiceJobStatus status) {
        this.status = status;
    }

    public ServiceLiability getLiability() {
        return liability;
    }

    public void setLiability(ServiceLiability liability) {
        this.liability = liability;
    }

    public String getWorkSummary() {
        return workSummary;
    }

    public void setWorkSummary(String workSummary) {
        this.workSummary = workSummary;
    }

    public String getDamageNotes() {
        return damageNotes;
    }

    public void setDamageNotes(String damageNotes) {
        this.damageNotes = damageNotes;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public String getTechnician() {
        return technician;
    }

    public void setTechnician(String technician) {
        this.technician = technician;
    }

    public long getTotalCostPaise() {
        return totalCostPaise;
    }

    public void setTotalCostPaise(long totalCostPaise) {
        this.totalCostPaise = totalCostPaise;
    }

    public Instant getCreatedOn() {
        return createdOn;
    }

    public Instant getClosedOn() {
        return closedOn;
    }

    public void setClosedOn(Instant closedOn) {
        this.closedOn = closedOn;
    }

    public Instant getUpdatedOn() {
        return updatedOn;
    }
}
