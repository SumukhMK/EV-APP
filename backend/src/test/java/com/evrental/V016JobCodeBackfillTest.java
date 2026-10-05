package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * V016 against a database that already has service jobs in it.
 *
 * <p>Every other test migrates an empty database, so a backfill that updates
 * nothing passes them. This one stops at V015, inserts jobs the way a live
 * tenant would have them, then applies V016 — which is what happened on the
 * local development database and failed with "column job_code contains
 * null values".
 *
 * <p>The cause is the thing V008 and V010 warn about: every tenant table has
 * FORCE ROW LEVEL SECURITY, and Flyway connects as {@code evrental} with no
 * {@code app.tenant_id} on the transaction, so an UPDATE in a migration sees
 * no rows unless the migration sets the bypass sentinel first. A role that
 * happens to bypass RLS (a superuser, Neon's owner) hides the bug, which is
 * why production took the migration and a developer's machine did not.
 *
 * <p>Runs in its own database inside the shared container so the suite's
 * schema, already at the latest version, is untouched.
 */
class V016JobCodeBackfillTest {

    private static final UUID TENANT = UUID.fromString("e0000000-0000-0000-0000-00000000000e");
    private static final UUID VEHICLE = UUID.fromString("e0000000-0000-0000-0000-0000000000a1");

    @Test
    void existingJobsAreNumberedOldestFirstEvenThoughFlywayRunsUnderForcedRls() throws Exception {
        PostgreSQLContainer pg = PostgresTestBase.POSTGRES;
        String db = "v016_probe";
        String url = pg.getJdbcUrl().replaceFirst("/" + pg.getDatabaseName() + "(\\?|$)", "/" + db + "$1");

        // A fresh database owned by the application role, shaped like the init script shapes the real one.
        try (Connection admin = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
             Statement s = admin.createStatement()) {
            s.execute("DROP DATABASE IF EXISTS " + db);
            s.execute("CREATE DATABASE " + db + " OWNER evrental");
        }
        try (Connection admin = DriverManager.getConnection(url, pg.getUsername(), pg.getPassword());
             Statement s = admin.createStatement()) {
            s.execute("ALTER SCHEMA public OWNER TO evrental");
            s.execute("GRANT ALL ON SCHEMA public TO evrental");
        }

        migrateTo(url, "015");

        // Two jobs, as the application would have written them: under the
        // tenant, through RLS. The older one is inserted second in the file
        // on purpose, so the assertion below is about dates, not insert order.
        try (Connection app = DriverManager.getConnection(url, "evrental", "evrental")) {
            app.setAutoCommit(false);
            try (Statement s = app.createStatement()) {
                s.execute("SELECT set_config('app.tenant_id', '*', true)");
                s.execute("INSERT INTO tenants (id, name, slug, status) VALUES ('" + TENANT
                        + "', 'Backfill Co', 'backfill-co', 'ACTIVE')");
                s.execute("INSERT INTO vehicles (id, tenant_id, registry_id, chassis_number, make, model, "
                        + "battery_type, hub, state, inducted_on) VALUES ('" + VEHICLE + "', '" + TENANT
                        + "', 'BLRSS0001', 'SESEAG03202300001', 'e-Sprinto', 'Ampere', 'Li-ion', 'Whitefield', "
                        + "'DEPLOYED', DATE '2025-12-01')");
                // The older one is closed: a bike has one open job at a time (idx_sj_one_active_per_vehicle).
                s.execute(job("Newer job", "2026-02-01", "OPEN"));
                s.execute(job("Older job", "2026-01-01", "CLOSED"));
            }
            app.commit();
        }

        migrateTo(url, "016");

        try (Connection app = DriverManager.getConnection(url, "evrental", "evrental")) {
            app.setAutoCommit(false);
            try (Statement s = app.createStatement()) {
                s.execute("SELECT set_config('app.tenant_id', '*', true)");
                List<String> codes = new ArrayList<>();
                try (ResultSet rs = s.executeQuery("SELECT damage_notes, job_code FROM service_jobs ORDER BY created_on")) {
                    while (rs.next()) {
                        codes.add(rs.getString(1) + "=" + rs.getString(2));
                    }
                }
                assertThat(codes).containsExactly("Older job=J01", "Newer job=J02");

                try (ResultSet rs = s.executeQuery(
                        "SELECT next_no FROM job_code_counters WHERE tenant_id = '" + TENANT + "'")) {
                    assertThat(rs.next()).as("the counter is seeded after the highest code").isTrue();
                    assertThat(rs.getLong(1)).isEqualTo(3L);
                }
            }
        }
    }

    private static void migrateTo(String url, String version) {
        Flyway.configure()
                .dataSource(url, "evrental", "evrental")
                .locations("classpath:db/migration")
                .target(version)
                .load()
                .migrate();
    }

    private static String job(String notes, String createdOn, String status) {
        // A closed job must say who paid and when it closed (chk_sj_closed_has_liability).
        String closing = status.equals("CLOSED") ? "'COMPANY', now()" : "NULL, NULL";
        return "INSERT INTO service_jobs (tenant_id, vehicle_id, source, damage_category, queue, status, "
                + "damage_notes, created_on, liability, closed_on) VALUES ('" + TENANT + "', '" + VEHICLE
                + "', 'DEBOARD', 'MINOR', 'MINOR_REPAIR', '" + status + "', '" + notes + "', TIMESTAMP '"
                + createdOn + " 10:00:00+05:30', " + closing + ")";
    }
}
