package com.evrental.payment;

import com.evrental.rider.BillingDay;
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
import org.hibernate.annotations.UpdateTimestamp;

/**
 * One rider's week, frozen at the moment the run was generated.
 *
 * <p>The whole design exists for one sentence: <b>the snapshot freezes what is
 * owed, collections record what came in, and status is a function of the
 * two.</b> Everything from {@code planAmountPaise} to {@code totalDuePaise} is
 * written once and never touched again, so raising a rider's weekly plan
 * cannot silently rewrite a receipt printed six weeks ago. Only
 * {@code amountPaidPaise}, {@code status} and {@code receiptNo} move, and they
 * move only because money arrived.
 *
 * <p>The frozen half is guarded at the mapping: every one of those columns is
 * {@code updatable = false}, so even a stray setter call cannot reach the
 * database. The setters exist for generation, which builds the row before it
 * is ever persisted.
 */
@Entity
@Table(name = "payment_periods")
public class PaymentPeriod {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "rider_id", nullable = false, updatable = false)
    private UUID riderId;

    @Column(name = "period_start", nullable = false, updatable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false, updatable = false)
    private LocalDate periodEnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_day", nullable = false, updatable = false)
    private BillingDay billingDay;

    /** Null until S5 supplies a real {@link AssignmentQuery}. */
    @Column(name = "vehicle_id", updatable = false)
    private UUID vehicleId;

    @Column(name = "plan_amount_paise", nullable = false, updatable = false)
    private long planAmountPaise;

    @Column(name = "days_billed", nullable = false, updatable = false)
    private int daysBilled;

    @Column(name = "per_day_amount_paise", nullable = false, updatable = false)
    private long perDayAmountPaise;

    @Column(name = "billed_amount_paise", nullable = false, updatable = false)
    private long billedAmountPaise;

    @Column(name = "service_charges_paise", nullable = false, updatable = false)
    private long serviceChargesPaise;

    @Column(name = "arrears_paise", nullable = false, updatable = false)
    private long arrearsPaise;

    @Column(name = "total_due_paise", nullable = false, updatable = false)
    private long totalDuePaise;

    @Column(name = "amount_paid_paise", nullable = false)
    private long amountPaidPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status = PaymentStatus.PENDING;

    @Column(name = "receipt_no")
    private String receiptNo;

    @CreationTimestamp
    @Column(name = "generated_on", nullable = false, updatable = false)
    private Instant generatedOn;

    @UpdateTimestamp
    @Column(name = "updated_on", nullable = false)
    private Instant updatedOn;

    /**
     * Sets what was actually collected, recomputed from the collection rows.
     *
     * <p>Always a recomputed {@code SUM}, never {@code amountPaid + amount}:
     * two people recording cash at the same counter would otherwise lose one
     * of the two payments.
     */
    public void applyCollected(long collectedPaise, LocalDate today) {
        this.amountPaidPaise = collectedPaise;
        recomputeStatus(today);
    }

    /**
     * The one place status is decided, so the run, the receipt and the overdue
     * list cannot disagree about a row.
     *
     * <p>OVERDUE is tested before PARTIAL, which is the reverse of the order
     * the design document lists. A week that has closed while still short is
     * overdue whether nothing came in or only half did, and the overdue screen
     * is the one place that has to say so — ordering PARTIAL first would hide
     * every part-paying rider from the chasing list, which is exactly the
     * rider who needs chasing.
     *
     * <p>Overpayment reads PAID rather than being refused: the contract
     * documents {@code balance} as "positive means still owed", which already
     * anticipates a negative, and turning money away at the counter is worse
     * than carrying a credit.
     */
    public void recomputeStatus(LocalDate today) {
        if (amountPaidPaise >= totalDuePaise) {
            this.status = PaymentStatus.PAID;
        } else if (today.isAfter(periodEnd)) {
            this.status = PaymentStatus.OVERDUE;
        } else if (amountPaidPaise > 0) {
            this.status = PaymentStatus.PARTIAL;
        } else {
            this.status = PaymentStatus.PENDING;
        }
    }

    /** Issued once, on the first collection, and never reissued. */
    public void assignReceiptNo(String receiptNo) {
        if (this.receiptNo == null) {
            this.receiptNo = receiptNo;
        }
    }

    /** totalDue − amountPaid. Negative when the rider has paid ahead. */
    public long balancePaise() {
        return totalDuePaise - amountPaidPaise;
    }

    /** Days between the day the money was due and today; never negative. */
    public long daysOverdue(LocalDate today) {
        return Math.max(0, today.toEpochDay() - periodEnd.toEpochDay());
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

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public void setPeriodStart(LocalDate periodStart) {
        this.periodStart = periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }

    public void setPeriodEnd(LocalDate periodEnd) {
        this.periodEnd = periodEnd;
    }

    public BillingDay getBillingDay() {
        return billingDay;
    }

    public void setBillingDay(BillingDay billingDay) {
        this.billingDay = billingDay;
    }

    public UUID getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(UUID vehicleId) {
        this.vehicleId = vehicleId;
    }

    public long getPlanAmountPaise() {
        return planAmountPaise;
    }

    public void setPlanAmountPaise(long planAmountPaise) {
        this.planAmountPaise = planAmountPaise;
    }

    public int getDaysBilled() {
        return daysBilled;
    }

    public void setDaysBilled(int daysBilled) {
        this.daysBilled = daysBilled;
    }

    public long getPerDayAmountPaise() {
        return perDayAmountPaise;
    }

    public void setPerDayAmountPaise(long perDayAmountPaise) {
        this.perDayAmountPaise = perDayAmountPaise;
    }

    public long getBilledAmountPaise() {
        return billedAmountPaise;
    }

    public void setBilledAmountPaise(long billedAmountPaise) {
        this.billedAmountPaise = billedAmountPaise;
    }

    public long getServiceChargesPaise() {
        return serviceChargesPaise;
    }

    public void setServiceChargesPaise(long serviceChargesPaise) {
        this.serviceChargesPaise = serviceChargesPaise;
    }

    public long getArrearsPaise() {
        return arrearsPaise;
    }

    public void setArrearsPaise(long arrearsPaise) {
        this.arrearsPaise = arrearsPaise;
    }

    public long getTotalDuePaise() {
        return totalDuePaise;
    }

    public void setTotalDuePaise(long totalDuePaise) {
        this.totalDuePaise = totalDuePaise;
    }

    public long getAmountPaidPaise() {
        return amountPaidPaise;
    }

    public PaymentStatus getStatus() {
        return status;
    }

    public String getReceiptNo() {
        return receiptNo;
    }

    public Instant getGeneratedOn() {
        return generatedOn;
    }

    public Instant getUpdatedOn() {
        return updatedOn;
    }
}
