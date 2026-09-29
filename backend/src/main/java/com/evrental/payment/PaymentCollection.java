package com.evrental.payment;

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
 * One payment received, against one period.
 *
 * <p>Append-only, and the entity has no setters past construction for that
 * reason. Two partial payments in one week is an ordinary case — riders pay
 * cash in pieces — and a mistyped amount is corrected with a reversing entry
 * rather than by editing money in place, which is the standing rule for every
 * money row in this module.
 */
@Entity
@Table(name = "payment_collections")
public class PaymentCollection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "period_id", nullable = false, updatable = false)
    private UUID periodId;

    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private PaymentMethod method;

    /** A UPI or bank reference, where the method carries one. */
    @Column(updatable = false)
    private String reference;

    @CreationTimestamp
    @Column(name = "collected_on", nullable = false, updatable = false)
    private Instant collectedOn;

    /** Who took the money. Null only for a row written outside a request. */
    @Column(name = "collected_by_user_id", updatable = false)
    private UUID collectedByUserId;

    protected PaymentCollection() {
        // JPA
    }

    public PaymentCollection(UUID tenantId, UUID periodId, long amountPaise, PaymentMethod method,
                             String reference, UUID collectedByUserId) {
        this.tenantId = tenantId;
        this.periodId = periodId;
        this.amountPaise = amountPaise;
        this.method = method;
        this.reference = reference;
        this.collectedByUserId = collectedByUserId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getPeriodId() {
        return periodId;
    }

    public long getAmountPaise() {
        return amountPaise;
    }

    public PaymentMethod getMethod() {
        return method;
    }

    public String getReference() {
        return reference;
    }

    public Instant getCollectedOn() {
        return collectedOn;
    }

    public UUID getCollectedByUserId() {
        return collectedByUserId;
    }
}
