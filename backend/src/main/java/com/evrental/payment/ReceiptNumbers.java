package com.evrental.payment;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The receipt book.
 *
 * <p>A row lock on {@code receipt_counters}, not a Postgres sequence. A
 * sequence keeps its value when a transaction rolls back, so a collection that
 * fails after taking a number leaves a hole in the book — and a receipt book
 * with holes in it is a question nobody wants to answer during an audit. The
 * {@code UPDATE ... RETURNING} below holds the row for the rest of the
 * collection's transaction, so a rollback puts the number back.
 *
 * <p>{@code MANDATORY} says the quiet part out loud: this must run inside the
 * caller's transaction. Issued on its own it would commit the increment
 * whatever happened to the collection, which is the exact failure the row lock
 * exists to prevent.
 */
@Component
public class ReceiptNumbers {

    private final JdbcTemplate jdbc;

    public ReceiptNumbers(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The next receipt number for a tenant's year, as {@code RCPT-2026-000001}.
     *
     * <p>Numbering restarts each year, which is how the books are read: a
     * receipt number names its year, so the counter is keyed by one.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String next(UUID tenantId, int year) {
        // First receipt of the year. DO NOTHING rather than a read-then-insert:
        // two counters opening the year in the same second must not collide.
        jdbc.update("INSERT INTO receipt_counters (tenant_id, year) VALUES (?, ?) "
                + "ON CONFLICT (tenant_id, year) DO NOTHING", tenantId, year);

        Long issued = jdbc.queryForObject(
                "UPDATE receipt_counters SET next_no = next_no + 1 "
                        + "WHERE tenant_id = ? AND year = ? RETURNING next_no - 1",
                Long.class, tenantId, year);

        return "RCPT-%d-%06d".formatted(year, issued == null ? 0L : issued);
    }
}
