package com.evrental.audit;

import com.evrental.common.PageResponse;
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

    /**
     * Paginated like every other list in the product.
     *
     * <p>The count is its own statement over the same union. That is a second
     * pass over the sources, and it is the honest price of a total: without it
     * the screen cannot say how many pages there are, and a trail that only
     * shows its first page while implying there is no more is the sort of
     * quiet omission an audit log exists to avoid.
     */
    @Transactional(readOnly = true)
    public PageResponse<AuditEventResponse> recent(int page, int size) {
        int limit = Math.min(Math.max(size, 1), MAX_SIZE);
        int offset = Math.max(page, 0) * limit;

        List<AuditEventResponse> rows = jdbc.query(SQL, (rs, i) -> new AuditEventResponse(
                rs.getString("id"),
                rs.getTimestamp("occurred_at").toInstant(),
                rs.getString("actor"),
                rs.getString("action"),
                rs.getString("entity"),
                rs.getString("before_value"),
                rs.getString("after_value")), limit, offset);

        Long total = jdbc.queryForObject("SELECT count(*) FROM (" + TRAIL + ") counted", Long.class);
        long totalElements = total == null ? 0 : total;
        int totalPages = (int) Math.max(1, Math.ceil(totalElements / (double) limit));
        return new PageResponse<>(rows, Math.max(page, 0), limit, totalElements, totalPages);
    }

    /**
     * Each branch names its own source in the id, so two rows from different
     * tables can never collide on a key the screen uses.
     *
     * <p>The date columns are cast to a timestamp at the start of the day.
     * An assignment records the day a bike went out, not the minute, and
     * pretending otherwise would put a false precision on the screen.
     */
    /** The union itself, reused by the count. */
    private static final String TRAIL = """
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

              -- A rider's weekly plan changing: it moves money every week after.
              SELECT 'plan:' || c.id,
                     c.occurred_on,
                     c.actor_name,
                     'Plan changed',
                     'Rider · ' || r.name,
                     round(c.from_paise / 100.0, 2)::text,
                     round(c.to_paise / 100.0, 2)::text
                FROM rider_plan_changes c
                JOIN riders r ON r.id = c.rider_id

              UNION ALL

              -- A user's role changing: it hands somebody new abilities.
              SELECT 'role:' || c.id,
                     c.occurred_on,
                     c.actor_name,
                     'Role changed',
                     'User · ' || u.email,
                     c.from_role,
                     c.to_role
                FROM user_role_changes c
                JOIN users u ON u.id = c.user_id

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
            """;

    private static final String SQL =
            "SELECT * FROM (" + TRAIL + ") trail ORDER BY occurred_at DESC LIMIT ? OFFSET ?";
}
