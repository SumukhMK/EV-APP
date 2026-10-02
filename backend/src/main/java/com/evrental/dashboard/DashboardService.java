package com.evrental.dashboard;

import com.evrental.dashboard.DashboardResponses.FleetSummary;
import com.evrental.dashboard.DashboardResponses.HubUtilisation;
import com.evrental.dashboard.DashboardResponses.MonthlyDeployments;
import com.evrental.dashboard.DashboardResponses.OperationsSummary;
import com.evrental.dashboard.DashboardResponses.RecoveryCounts;
import com.evrental.payment.BillingClock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Counts, in SQL.
 *
 * <p>Every method here answers one screen's worth of question with as few
 * statements as it can — one grouped count rather than one query per tile —
 * because this is what runs on the first screen after login.
 *
 * <p>Read-only throughout. The dashboard reports; it never repairs a status
 * the way {@code PaymentRunService.overdue()} deliberately does. That is why
 * the overdue figures below are read from the numbers (balance outstanding and
 * the period closed) rather than from the stored {@code status} enum — the
 * same rule that method documents, applied without its write.
 */
@Service
public class DashboardService {

    private final JdbcTemplate jdbc;
    private final BillingClock clock;

    public DashboardService(JdbcTemplate jdbc, BillingClock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // -----------------------------------------------------------------------
    // The dashboard's eight tiles
    // -----------------------------------------------------------------------

    /**
     * @param includeMoney false for FLEET_STAFF and SERVICE_MANAGER, whose
     *                     overdue figures come back as zero (RBAC.md, Money).
     */
    @Transactional(readOnly = true)
    public FleetSummary fleetSummary(boolean includeMoney) {
        Map<String, Long> byState = countsByState();

        // RETIRED is excluded from the fleet total: it is a bike that has left
        // the fleet, and counting it would make "total" disagree with every
        // tile below it as retirements accumulate.
        long total = byState.entrySet().stream()
                .filter(e -> !"RETIRED".equals(e.getKey()))
                .mapToLong(Map.Entry::getValue)
                .sum();

        long overdueRiders = 0;
        long overdueValue = 0;
        if (includeMoney) {
            LocalDate today = clock.today();
            // One row per overdue period; a rider with two late weeks is one
            // rider to chase, which is what the tile means.
            overdueRiders = scalar("""
                    SELECT count(DISTINCT rider_id) FROM payment_periods
                     WHERE period_end < ? AND amount_paid_paise < total_due_paise
                    """, today);
            overdueValue = scalar("""
                    SELECT coalesce(sum(total_due_paise - amount_paid_paise), 0) FROM payment_periods
                     WHERE period_end < ? AND amount_paid_paise < total_due_paise
                    """, today);
        }

        return new FleetSummary(
                total,
                byState.getOrDefault("DEPLOYED", 0L),
                byState.getOrDefault("READY_TO_DEPLOY", 0L),
                byState.getOrDefault("UNDER_REPAIR", 0L),
                byState.getOrDefault("QC_PENDING", 0L),
                byState.getOrDefault("ACCIDENT", 0L),
                byState.getOrDefault("RECOVERY", 0L),
                overdueRiders,
                overdueValue);
    }

    // -----------------------------------------------------------------------
    // Today's Operations
    // -----------------------------------------------------------------------

    /** Each hub's deployed share, busiest first. */
    @Transactional(readOnly = true)
    public List<HubUtilisation> hubUtilisation() {
        List<HubUtilisation> rows = jdbc.query("""
                SELECT hub,
                       count(*)                                          AS total,
                       count(*) FILTER (WHERE state = 'DEPLOYED')        AS deployed
                  FROM vehicles
                 WHERE state <> 'RETIRED'
                 GROUP BY hub
                 ORDER BY hub
                """, (rs, i) -> {
            long total = rs.getLong("total");
            long deployed = rs.getLong("deployed");
            // Integer percent, matching the frontend's bandFor() input. A hub
            // with no bikes is 0% rather than a division by zero.
            int percent = total == 0 ? 0 : (int) Math.round((deployed * 100.0) / total);
            return new HubUtilisation(rs.getString("hub"), total, deployed, total - deployed, percent);
        });
        return rows.stream()
                .sorted((a, b) -> Integer.compare(b.percent(), a.percent()))
                .toList();
    }

    /**
     * Deployments per month, oldest first, with empty months filled in.
     *
     * <p>A month nobody deployed in is a zero on the chart, not a gap — SQL
     * returns no row for it, so the series is built from the calendar and the
     * counts are laid onto it.
     *
     * <p>Counted from assignments, not from the vehicle lifecycle log: a
     * deployment is a bike going out to a rider, and a bike can reach
     * DEPLOYED without one.
     */
    @Transactional(readOnly = true)
    public List<MonthlyDeployments> monthlyDeployments(int months) {
        YearMonth end = YearMonth.from(clock.today());
        YearMonth start = end.minusMonths(months - 1L);

        Map<String, Long> counts = new LinkedHashMap<>();
        jdbc.query("""
                SELECT to_char(started_on, 'YYYY-MM') AS month, count(*) AS count
                  FROM assignments
                 WHERE started_on >= ?
                 GROUP BY 1
                """, rs -> {
            counts.put(rs.getString("month"), rs.getLong("count"));
        }, start.atDay(1));

        List<MonthlyDeployments> series = new ArrayList<>(months);
        for (YearMonth m = start; !m.isAfter(end); m = m.plusMonths(1)) {
            String key = m.toString();
            series.add(new MonthlyDeployments(key, counts.getOrDefault(key, 0L)));
        }
        return series;
    }

    /**
     * What happened between two dates, inclusive.
     *
     * <p>The three strips come from three different facts, which is why this
     * is three statements and not one join: movement is assignment rows
     * opening and closing, outcome is the vehicle lifecycle log, and source is
     * where a service job came from.
     */
    @Transactional(readOnly = true)
    public OperationsSummary operationsSummary(LocalDate from, LocalDate to) {
        // The window is inclusive of `to`, and the two timestamp columns below
        // are TIMESTAMPTZ, so the exclusive upper bound is the day after.
        LocalDate endExclusive = to.plusDays(1);

        OperationsSummary.Movement movement = jdbc.queryForObject("""
                SELECT
                  count(*) FILTER (WHERE started_on BETWEEN ? AND ?)                              AS deployed,
                  count(*) FILTER (WHERE ended_on BETWEEN ? AND ?
                                     AND reason IN ('BREAKDOWN','BATTERY_ISSUE','ACCIDENT',
                                                    'SERVICE_REQUIRED','RIDER_REQUEST','UPGRADE','OTHER'))
                                                                                                  AS exchanged,
                  count(*) FILTER (WHERE ended_on BETWEEN ? AND ?
                                     AND reason IN ('WENT_HOME','RETURNED','LEFT_AT_HUB',
                                                    'PAYMENT_ISSUE','SERVICE_ISSUE'))             AS returned,
                  count(*) FILTER (WHERE ended_on BETWEEN ? AND ?
                                     AND reason IN ('RECOVERED_BY_TEAM','LEFT_AT_ROADSIDE'))      AS recovered
                  FROM assignments
                """, (rs, i) -> new OperationsSummary.Movement(
                        rs.getLong("deployed"), rs.getLong("exchanged"),
                        rs.getLong("returned"), rs.getLong("recovered")),
                from, to, from, to, from, to, from, to);

        OperationsSummary.Outcome outcome = jdbc.queryForObject("""
                SELECT
                  count(*) FILTER (WHERE to_state = 'READY_TO_DEPLOY') AS ready_to_deploy,
                  count(*) FILTER (WHERE to_state = 'UNDER_REPAIR')    AS under_repair,
                  count(*) FILTER (WHERE to_state = 'QC_PENDING')      AS qc_pending,
                  count(*) FILTER (WHERE to_state = 'ACCIDENT')        AS accident
                  FROM vehicle_lifecycle_events
                 WHERE occurred_on >= ? AND occurred_on < ?
                """, (rs, i) -> new OperationsSummary.Outcome(
                        rs.getLong("ready_to_deploy"), rs.getLong("under_repair"),
                        rs.getLong("qc_pending"), rs.getLong("accident")),
                from.atStartOfDay(), endExclusive.atStartOfDay());

        OperationsSummary.Source source = jdbc.queryForObject("""
                SELECT
                  count(*) FILTER (WHERE source = 'RSA')     AS rsa,
                  count(*) FILTER (WHERE source = 'WALK_IN') AS walk_in,
                  count(*) FILTER (WHERE source = 'QRT')     AS qrt
                  FROM service_jobs
                 WHERE created_on >= ? AND created_on < ?
                """, (rs, i) -> new OperationsSummary.Source(
                        rs.getLong("rsa"), rs.getLong("walk_in"), rs.getLong("qrt")),
                from.atStartOfDay(), endExclusive.atStartOfDay());

        return new OperationsSummary(movement, outcome, source);
    }

    // -----------------------------------------------------------------------
    // The recovery board
    // -----------------------------------------------------------------------

    /**
     * @param includeMoney as {@link #fleetSummary(boolean)} — the two
     *                     payment-driven rows are zero without it.
     */
    @Transactional(readOnly = true)
    public RecoveryCounts recoveryCounts(boolean includeMoney) {
        long partiallyPaid = 0;
        long notPaid = 0;
        if (includeMoney) {
            LocalDate today = clock.today();
            // Split by whether anything at all came in: a rider who has paid
            // part of a closed week is a different conversation from one who
            // has paid nothing.
            partiallyPaid = scalar("""
                    SELECT count(DISTINCT rider_id) FROM payment_periods
                     WHERE period_end < ? AND amount_paid_paise > 0
                       AND amount_paid_paise < total_due_paise
                    """, today);
            notPaid = scalar("""
                    SELECT count(DISTINCT rider_id) FROM payment_periods
                     WHERE period_end < ? AND amount_paid_paise = 0 AND total_due_paise > 0
                    """, today);
        }

        // A bike whose last assignment was left at the roadside and which has
        // not been collected since — the state is what makes it outstanding,
        // the reason is what makes it this row rather than another.
        long leftAtRoadside = scalar("""
                SELECT count(*) FROM vehicles v
                 WHERE v.state = 'RECOVERY'
                   AND EXISTS (SELECT 1 FROM assignments a
                                WHERE a.vehicle_id = v.id
                                  AND a.reason = 'LEFT_AT_ROADSIDE'
                                  AND a.ended_on IS NOT NULL)
                """);
        long accident = scalar("SELECT count(*) FROM vehicles WHERE state = 'ACCIDENT'");
        long recovered = scalar("""
                SELECT count(*) FROM vehicles
                 WHERE state IN ('UNDER_REPAIR', 'QC_PENDING', 'READY_TO_DEPLOY')
                   AND EXISTS (SELECT 1 FROM assignments a
                                WHERE a.vehicle_id = vehicles.id
                                  AND a.reason IN ('RECOVERED_BY_TEAM','LEFT_AT_ROADSIDE'))
                """);

        return new RecoveryCounts(
                new RecoveryCounts.NeedToRecover(partiallyPaid, notPaid, leftAtRoadside, 0, accident),
                new RecoveryCounts.Recovered(recovered));
    }

    // -----------------------------------------------------------------------

    private Map<String, Long> countsByState() {
        Map<String, Long> counts = new LinkedHashMap<>();
        jdbc.query("SELECT state, count(*) AS count FROM vehicles GROUP BY state",
                rs -> {
                    counts.put(rs.getString("state"), rs.getLong("count"));
                });
        return counts;
    }

    private long scalar(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }
}
