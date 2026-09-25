package com.evrental.service;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * One priced line of work -- a part, an hour of labour, a consumable.
 *
 * <p>Money is paise in a BIGINT. Never a float: a rider's bill that is out by
 * a rounding error is out by a rounding error every week.
 *
 * <p>Items are replaced wholesale on update rather than patched line by line.
 * The desk edits a table and saves it; matching that with a diff would invent
 * identities the screen never showed anyone.
 */
@Entity
@Table(name = "service_job_items")
public class ServiceJobItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(nullable = false)
    private String label;

    @Column(name = "cost_paise", nullable = false)
    private long costPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ServiceJobItemKind kind = ServiceJobItemKind.OTHER;

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

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public long getCostPaise() {
        return costPaise;
    }

    public void setCostPaise(long costPaise) {
        this.costPaise = costPaise;
    }

    public ServiceJobItemKind getKind() {
        return kind;
    }

    public void setKind(ServiceJobItemKind kind) {
        this.kind = kind;
    }
}
