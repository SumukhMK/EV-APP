package com.evrental.payment;

import com.evrental.service.ServiceLiability;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One cost a rider owes, raised when a service job closes against them.
 *
 * <p>Money rows are never edited (WORK_SPLIT.md's standing rule): settling one
 * sets its status and stamps the date, and a correction is a new row rather
 * than a changed one. There is no setter for the amount for that reason.
 *
 * <p>riderId carries a foreign key as of V008, added NOT VALID because charges
 * written before S2 landed name riders that never existed on the register.
 * Every charge raised from V008 onward is checked in full.
 */
@Entity
@Table(name = "rider_charges")
public class RiderCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "rider_id", nullable = false)
    private UUID riderId;

    /**
     * The job this charge came from, or null for a settlement.
     *
     * <p>Nullable since V014: a deboard's outstanding rent is a charge with no
     * repair behind it. The unique index on this column still stops a job
     * being billed twice, because Postgres allows many NULLs in a unique
     * index.
     */
    @Column(name = "service_job_id")
    private UUID serviceJobId;

    @Column(name = "vehicle_id")
    private UUID vehicleId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    /** Only RIDER and DEPOSIT reach this table; COMPANY raises no charge. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceLiability liability;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiderChargeStatus status = RiderChargeStatus.OPEN;

    @CreationTimestamp
    @Column(name = "charged_on", nullable = false, updatable = false)
    private Instant chargedOn;

    /**
     * The billing period this charge first appears against.
     *
     * <p>Stamped once, at charge time, from the rider's billing day — a fact
     * recorded rather than re-derived. Deriving it from {@code chargedOn} on
     * every read would re-bucket a rider's whole charge history the day they
     * move between the Monday and Wednesday cycles, and a settled week would
     * silently change what it had contained.
     *
     * <p>It is the single field that separates the two money columns on a run
     * row: {@code serviceCharges} are charges landing in this period,
     * {@code arrears} are OPEN charges from before it.
     */
    @Column(name = "period_start", nullable = false, updatable = false)
    private LocalDate periodStart;

    @Column(name = "settled_on")
    private Instant settledOn;

    @CreationTimestamp
    @Column(name = "created_on", nullable = false, updatable = false)
    private Instant createdOn;

    /** Settles the charge. One way only: a settled charge is never reopened. */
    public void settle(Instant when) {
        this.status = RiderChargeStatus.SETTLED;
        this.settledOn = when;
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

    public UUID getRiderId() {
        return riderId;
    }

    public void setRiderId(UUID riderId) {
        this.riderId = riderId;
    }

    public UUID getServiceJobId() {
        return serviceJobId;
    }

    public void setServiceJobId(UUID serviceJobId) {
        this.serviceJobId = serviceJobId;
    }

    public UUID getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(UUID vehicleId) {
        this.vehicleId = vehicleId;
    }

    public long getAmountPaise() {
        return amountPaise;
    }

    public void setAmountPaise(long amountPaise) {
        this.amountPaise = amountPaise;
    }

    public ServiceLiability getLiability() {
        return liability;
    }

    public void setLiability(ServiceLiability liability) {
        this.liability = liability;
    }

    public RiderChargeStatus getStatus() {
        return status;
    }

    public Instant getChargedOn() {
        return chargedOn;
    }

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public void setPeriodStart(LocalDate periodStart) {
        this.periodStart = periodStart;
    }

    public Instant getSettledOn() {
        return settledOn;
    }

    public Instant getCreatedOn() {
        return createdOn;
    }
}
