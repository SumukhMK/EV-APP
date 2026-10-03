package com.evrental.audit;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Records the two acts that left no trace.
 *
 * <p>The trail reads the records modules already write, which is what stops it
 * drifting from reality. Two things had no such record: changing a rider's
 * weekly plan, and changing a user's role. Both are decisions worth answering
 * for — one moves money every week afterwards, the other hands somebody the
 * ability to move it.
 *
 * <p>So they are written here, by the code that performs them, rather than by
 * a listener watching from the side. A listener can be removed, fail silently,
 * or run after a rollback; a write in the same transaction as the change
 * either both happen or neither does.
 *
 * <p>Only differences are recorded. Saving a form without touching the field
 * is not a change, and a trail full of "1600 to 1600" is a trail nobody reads.
 */
@Component
public class ChangeLog {

    private final JdbcTemplate jdbc;

    public ChangeLog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void planChanged(UUID tenantId, UUID riderId, long fromPaise, long toPaise, String actorName) {
        if (fromPaise == toPaise) {
            return;
        }
        jdbc.update("""
                INSERT INTO rider_plan_changes (tenant_id, rider_id, from_paise, to_paise, actor_name)
                VALUES (?, ?, ?, ?, ?)
                """, tenantId, riderId, fromPaise, toPaise, actorName);
    }

    public void roleChanged(UUID tenantId, UUID userId, String fromRole, String toRole, String actorName) {
        if (fromRole.equals(toRole)) {
            return;
        }
        jdbc.update("""
                INSERT INTO user_role_changes (tenant_id, user_id, from_role, to_role, actor_name)
                VALUES (?, ?, ?, ?, ?)
                """, tenantId, userId, fromRole, toRole, actorName);
    }
}
