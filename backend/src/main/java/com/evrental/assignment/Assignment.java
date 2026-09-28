package com.evrental.assignment;

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
 * One period a bike is out with a rider.
 *
 * <p>A period model, not a current-value column: assign opens a row, exchange
 * closes one and opens the next, deboard closes one. The open row (endedOn
 * null) is the single source of truth for the derived fields the entities
 * deliberately do not store — Rider.currentVehicleId and
 * Vehicle.currentRiderId/currentRiderName — so there is exactly one copy of
 * "who has which bike" and it cannot drift.
 *
 * <p>The return facts are recorded on the closing row: why the bike came back
 * (reason), what shape it was in (returnCondition), where the operator chose
 * to send it (nextVehicleState — recorded as a fact; the bike actually goes
 * where the damage category routes it, see AssignmentService), the notes, and
 * the two settlement figures. The settlement figures are facts for S6's second
 * half, which turns them into ledger rows under FA approval; S5 writes nothing
 * to the money ledger.
 *
 * <p>reason is a String rather than an enum because the exchange and deboard
 * reasons are different questions with different value sets; the migration's
 * CHECK names both.
 */
@Entity
@Table(name = "assignments")
public class Assignment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "rider_id", nullable = false)
    private UUID riderId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "started_on", nullable = false)
    private LocalDate startedOn;

    @Column(name = "ended_on")
    private LocalDate endedOn;

    @Column
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "return_condition")
    private com.evrental.service.DamageCategory returnCondition;

    @Enumerated(EnumType.STRING)
    @Column(name = "next_vehicle_state")
    private com.evrental.vehicle.VehicleState nextVehicleState;

    @Column
    private String note;

    @Column(name = "damage_notes")
    private String damageNotes;

    @Column(name = "outstanding_rent_paise")
    private Long outstandingRentPaise;

    @Column(name = "deposit_refund_paise")
    private Long depositRefundPaise;

    @Column(name = "closed_by")
    private String closedBy;

    @CreationTimestamp
    @Column(name = "created_on", nullable = false, updatable = false)
    private Instant createdOn;

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

    public UUID getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(UUID vehicleId) {
        this.vehicleId = vehicleId;
    }

    public LocalDate getStartedOn() {
        return startedOn;
    }

    public void setStartedOn(LocalDate startedOn) {
        this.startedOn = startedOn;
    }

    public LocalDate getEndedOn() {
        return endedOn;
    }

    public void setEndedOn(LocalDate endedOn) {
        this.endedOn = endedOn;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public com.evrental.service.DamageCategory getReturnCondition() {
        return returnCondition;
    }

    public void setReturnCondition(com.evrental.service.DamageCategory returnCondition) {
        this.returnCondition = returnCondition;
    }

    public com.evrental.vehicle.VehicleState getNextVehicleState() {
        return nextVehicleState;
    }

    public void setNextVehicleState(com.evrental.vehicle.VehicleState nextVehicleState) {
        this.nextVehicleState = nextVehicleState;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getDamageNotes() {
        return damageNotes;
    }

    public void setDamageNotes(String damageNotes) {
        this.damageNotes = damageNotes;
    }

    public Long getOutstandingRentPaise() {
        return outstandingRentPaise;
    }

    public void setOutstandingRentPaise(Long outstandingRentPaise) {
        this.outstandingRentPaise = outstandingRentPaise;
    }

    public Long getDepositRefundPaise() {
        return depositRefundPaise;
    }

    public void setDepositRefundPaise(Long depositRefundPaise) {
        this.depositRefundPaise = depositRefundPaise;
    }

    public String getClosedBy() {
        return closedBy;
    }

    public void setClosedBy(String closedBy) {
        this.closedBy = closedBy;
    }

    public Instant getCreatedOn() {
        return createdOn;
    }
}