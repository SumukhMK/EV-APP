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
 * One payment from a rider, or the reversal of one.
 *
 * <p>Append-only: no setters past construction. A payment names the rider,
 * not a week — the account sums them and works out which weeks they cover.
 * A mistake is fixed with a reversal: a second row, the negative of the first,
 * that names it in {@code reversesId} and says why.
 *
 * <p>{@code periodId} is only set on payments recorded before V022, when each
 * payment was cut into one piece per week.
 */
@Entity
@Table(name = "payment_collections")
public class PaymentCollection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "rider_id", nullable = false, updatable = false)
    private UUID riderId;

    @Column(name = "period_id", updatable = false)
    private UUID periodId;

    /** Positive for a payment, negative for a reversal. */
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

    /** Who took the money, or who reversed it. Null only for a row written outside a request. */
    @Column(name = "collected_by_user_id", updatable = false)
    private UUID collectedByUserId;

    @Column(name = "reverses_id", updatable = false)
    private UUID reversesId;

    @Column(updatable = false)
    private String reason;

    @Column(name = "client_key", updatable = false)
    private String clientKey;

    @Column(name = "receipt_no", updatable = false)
    private String receiptNo;

    @Column(name = "owed_before_paise", updatable = false)
    private Long owedBeforePaise;

    @Column(name = "owed_after_paise", updatable = false)
    private Long owedAfterPaise;

    /** When the receipt was first printed. Null until then; set once, never cleared. */
    @Column(name = "receipt_issued_at")
    private Instant receiptIssuedAt;

    protected PaymentCollection() {
        // JPA
    }

    static PaymentCollection payment(UUID tenantId, UUID riderId, long amountPaise, PaymentMethod method,
                                     String reference, UUID byUserId, String clientKey, String receiptNo,
                                     long owedBefore) {
        PaymentCollection c = new PaymentCollection();
        c.tenantId = tenantId;
        c.riderId = riderId;
        c.amountPaise = amountPaise;
        c.method = method;
        c.reference = reference;
        c.collectedByUserId = byUserId;
        c.clientKey = clientKey;
        c.receiptNo = receiptNo;
        c.owedBeforePaise = owedBefore;
        c.owedAfterPaise = owedBefore - amountPaise;
        return c;
    }

    static PaymentCollection reversal(PaymentCollection of, UUID byUserId, String reason, long owedBefore) {
        PaymentCollection c = new PaymentCollection();
        c.tenantId = of.tenantId;
        c.riderId = of.riderId;
        c.amountPaise = -of.amountPaise;
        c.method = of.method;
        c.collectedByUserId = byUserId;
        c.reversesId = of.id;
        c.reason = reason;
        c.owedBeforePaise = owedBefore;
        c.owedAfterPaise = owedBefore + of.amountPaise;
        return c;
    }

    public Instant getReceiptIssuedAt() {
        return receiptIssuedAt;
    }

    /** The first print counts; a reprint does not move it. */
    void markReceiptIssued(Instant at) {
        if (receiptIssuedAt == null) receiptIssuedAt = at;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getRiderId() {
        return riderId;
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

    public UUID getReversesId() {
        return reversesId;
    }

    public boolean isReversal() {
        return reversesId != null;
    }

    public String getReason() {
        return reason;
    }

    public String getClientKey() {
        return clientKey;
    }

    public String getReceiptNo() {
        return receiptNo;
    }

    public Long getOwedBeforePaise() {
        return owedBeforePaise;
    }

    public Long getOwedAfterPaise() {
        return owedAfterPaise;
    }
}
