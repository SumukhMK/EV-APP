package com.evrental.service;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The service job code book.
 *
 * <p>A row lock on {@code job_code_counters}, not a Postgres sequence —
 * the same reasoning as {@code payment.ReceiptNumbers}. A sequence keeps its
 * value when a transaction rolls back, so a job that failed to open after taking
 * a number would leave a hole in the numbering, and {@code J01, J02, J04} is
 * a worse front desk experience than a sequence ever saves. The
 * {@code UPDATE ... RETURNING} below holds the row for the rest of the
 * opening transaction, so a rollback puts the number back.
 *
 * <p>{@code MANDATORY} says this must run inside the caller's transaction:
 * issued on its own it would commit the increment whatever happened to the
 * open, which is the exact failure the row lock exists to prevent.
 */
@Component
public class ServiceJobCodes {

    private final JdbcTemplate jdbc;

    public ServiceJobCodes(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The next job code for a tenant, as {@code J01}. Two digits while the
     * tenant has fewer than 100 jobs, growing past that rather than
     * truncating — {@code J100}, not a wrapped {@code J00}.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String next(UUID tenantId) {
        // First job ever opened for this tenant. DO NOTHING rather than a
        // read-then-insert: two jobs opened in the same tenant's first second
        // must not collide.
        jdbc.update("INSERT INTO job_code_counters (tenant_id) VALUES (?) "
                + "ON CONFLICT (tenant_id) DO NOTHING", tenantId);

        Long issued = jdbc.queryForObject(
                "UPDATE job_code_counters SET next_no = next_no + 1 "
                        + "WHERE tenant_id = ? RETURNING next_no - 1",
                Long.class, tenantId);

        long n = issued == null ? 1L : issued;
        return n < 100 ? "J%02d".formatted(n) : "J" + n;
    }
}
