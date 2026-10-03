package com.evrental.audit;

import java.time.Instant;

/**
 * One line of the trail, matching {@code AuditEvent} in
 * {@code frontend/app/src/types/audit.ts}.
 *
 * <p>{@code before} and {@code after} are display strings rather than typed
 * values because the rows come from four different tables and the only thing
 * they have in common is that something changed from one thing to another.
 */
public record AuditEventResponse(
        String id,
        Instant occurredAt,
        String actor,
        String action,
        String entity,
        String before,
        String after) {
}
