package com.evrental.audit;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The trail, newest first.
 *
 * <p>One statement, a UNION of the places the system already records what it
 * did. See the package note for why there is no audit table.
 *
 * <p>Tenant scoping is row-level security, as everywhere else: none of the
 * branches below carries a {@code tenant_id} predicate and none needs one.
 */
@Service
public class AuditService {

    /** A page bigger than this is a report, not a screen. */
    private static final int MAX_SIZE = 200;

    private final JdbcTemplate jdbc;

    public AuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<AuditEventResponse> recent(int size) {
        int limit = Math.min(Math.max(size, 1), MAX_SIZE);
        return jdbc.query(SQL, (rs, i) -> new AuditEventResponse(
                rs.getString("id"),
                rs.getTimestamp("occurred_at").toInstant(),
                rs.getString("actor"),
                rs.getString("action"),
                rs.getString("entity"),
                rs.getString("before_value"),
                rs.getString("after_value")), limit);
    }

    /**
     * Each branch names its own source in the id, so two rows from different
     * tables can never collide on a key the screen uses.
     *
     * <p>The date columns are cast to a timestamp at the start of the day.
     * An assignment records the day a bike went out, not the minute, and
     * pretending otherwise would put a false precision on the screen.
     */
    private static final String SQL = """
            SELECT * FROM (
              -- A bike moving between states: the workshop, the yard, the road.
              SELECT 'lifecycle:' || e.id              AS id,
                     e.occurred_on                     AS occurred_at,
                     e.actor_name                      AS actor,
                     'State changed'                   AS action,
                     'Vehicle · ' || v.registry_id     AS entity,
                     e.from_state                      AS before_value,
                     e.to_state                        AS after_value
                FROM vehicle_lifecycle_events e
                JOIN vehicles v ON v.id = e.vehicle_id

              UNION ALL

              -- A rider taking a bike out.
              SELECT 'assign-open:' || a.id,
                     a.started_on::timestamptz,
                     coalesce(a.closed_by, 'System'),
                     'Assignment opened',
                     'Rider · ' || r.name,
                     NULL,
                     v.registry_id
                FROM assignments a
                JOIN riders r   ON r.id = a.rider_id
                JOIN vehicles v ON v.id = a.vehicle_id

              UNION ALL

              -- And handing it back, with the reason recorded on the closing row.
              SELECT 'assign-close:' || a.id,
                     a.ended_on::timestamptz,
                     coalesce(a.closed_by, 'System'),
                     'Assignment closed',
                     'Rider · ' || r.name,
                     v.registry_id,
                     coalesce(a.reason, 'Returned')
                FROM assignments a
                JOIN riders r   ON r.id = a.rider_id
                JOIN vehicles v ON v.id = a.vehicle_id
               WHERE a.ended_on IS NOT NULL

              UNION ALL

              -- Money in. Never edited, so each row is one collection.
              SELECT 'collection:' || c.id,
                     c.collected_on,
                     coalesce(u.name, 'Unknown'),
                     'Payment recorded',
                     'Payment · ' || r.name || ' / ' || to_char(p.period_start, 'DD Mon'),
                     'Due ' || round(p.total_due_paise / 100.0, 2)::text,
                     'Paid ' || round(c.amount_paise / 100.0, 2)::text
                FROM payment_collections c
                JOIN payment_periods p ON p.id = c.period_id
                JOIN riders r          ON r.id = p.rider_id
                LEFT JOIN users u      ON u.id = c.collected_by_user_id

              UNION ALL

              -- Workshop movements: intake, QC, release.
              SELECT 'service:' || e.id,
                     e.occurred_on,
                     e.actor,
                     'Job updated',
                     'Vehicle · ' || v.registry_id,
                     NULL,
                     e.queue
                FROM service_job_events e
                JOIN service_jobs j ON j.id = e.job_id
                JOIN vehicles v     ON v.id = j.vehicle_id

              UNION ALL

              -- A rider joining the register.
              SELECT 'onboard:' || r.id,
                     r.onboarded_on::timestamptz,
                     'Onboarding',
                     'Rider onboarded',
                     'Rider · ' || r.name,
                     NULL,
                     r.name
                FROM riders r
            ) trail
            ORDER BY occurred_at DESC
            LIMIT ?
            """;
}
