package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The migrations against the database Render actually has, not the empty one
 * CI always gets.
 *
 * <p>On 2026-09-29 two branches each added a {@code V009}. PR #11 merged the
 * payment-periods one into main at 13:55Z and the Deploy API job applied it
 * to the production Neon database. Three hours later the backend-dev merge
 * (949ff2b) brought in {@code V009__assignments.sql} and renamed the payment
 * file to {@code V010}. From then on production's history row for version 9
 * described a script that had never run there, and every object V010 creates
 * was already in the schema.
 *
 * <p>Each test gets its own container because the point is the starting
 * state: {@link PostgresTestBase}'s shared instance is already fully migrated.
 */
class MigrationRecoveryTest {

    private static final String MIGRATIONS = "classpath:db/migration";
    private static final String AS_DEPLOYED = "classpath:db/render-incident-2026-09-29";

    @Test
    void recoversADatabaseWhereVersion9WasThePaymentPeriodsScript() throws Exception {
        try (PostgreSQLContainer pg = newContainer()) {
            pg.start();

            // 1. main as deployed by PR #11: V001..V008, then the payment
            //    script under the number 9. Flyway writes the history row, so
            //    it is exactly the row production has.
            flyway(pg, MIGRATIONS).target("8").load().migrate();
            flyway(pg, AS_DEPLOYED).ignoreMigrationPatterns("*:missing").load().migrate();
            assertThat(history(pg)).contains("009|payment periods|true");

            // 2. Every boot since: FlywayConfig's repair-then-migrate against
            //    today's files, where 9 is assignments and 10 is payment.
            Flyway today = flyway(pg, MIGRATIONS).load();
            today.repair();
            today.migrate();

            assertThat(history(pg))
                    .contains("009|assignments|true", "010|payment periods|true",
                              "011|assignments after renumbering|true")
                    .doesNotContain("|false");

            // Both modules' schema is there, once.
            for (String table : List.of("assignments", "payment_periods",
                    "payment_collections", "receipt_counters")) {
                assertThat(tableExists(pg, table)).as("table %s", table).isTrue();
                assertThat(policyCount(pg, table)).as("tenant_isolation on %s", table).isEqualTo(1);
                assertThat(forcesRls(pg, table)).as("FORCE RLS on %s", table).isTrue();
            }
            for (String index : List.of("idx_assignments_open_rider", "idx_assignments_open_vehicle",
                    "idx_assignments_vehicle", "idx_assignments_rider",
                    "idx_rc_period", "idx_pp_rider_period", "idx_pp_run", "idx_pp_status",
                    "idx_pp_rider", "idx_pc_period")) {
                assertThat(indexExists(pg, index)).as("index %s", index).isTrue();
            }
            assertThat(columnIsNotNull(pg, "rider_charges", "period_start")).isTrue();
        }
    }

    @Test
    void aFreshDatabaseAppliesEveryMigrationOnceWithoutDuplicatingPolicies() throws Exception {
        try (PostgreSQLContainer pg = newContainer()) {
            pg.start();

            Flyway today = flyway(pg, MIGRATIONS).load();
            today.repair();
            today.migrate();

            assertThat(history(pg))
                    .contains("009|assignments|true", "010|payment periods|true",
                              "011|assignments after renumbering|true")
                    .doesNotContain("|false");
            for (String table : List.of("assignments", "payment_periods",
                    "payment_collections", "receipt_counters")) {
                assertThat(policyCount(pg, table)).as("tenant_isolation on %s", table).isEqualTo(1);
                assertThat(forcesRls(pg, table)).as("FORCE RLS on %s", table).isTrue();
            }
        }
    }

    // --- plumbing -----------------------------------------------------------

    @SuppressWarnings("resource")
    private static PostgreSQLContainer newContainer() {
        return new PostgreSQLContainer("postgres:16-alpine")
                .withInitScript("db/init/01-app-role.sql");
    }

    /** Connected as {@code evrental}, as the application and Flyway are. */
    private static org.flywaydb.core.api.configuration.FluentConfiguration flyway(
            PostgreSQLContainer pg, String location) {
        return Flyway.configure()
                .dataSource(pg.getJdbcUrl(), "evrental", "evrental")
                .locations(location);
    }

    private static Connection connect(PostgreSQLContainer pg) throws SQLException {
        return DriverManager.getConnection(pg.getJdbcUrl(), "evrental", "evrental");
    }

    /** One line per applied version: {@code version|description|success}. */
    private static List<String> history(PostgreSQLContainer pg) throws SQLException {
        List<String> rows = new ArrayList<>();
        try (Connection c = connect(pg);
             PreparedStatement ps = c.prepareStatement(
                 "SELECT version, description, success FROM flyway_schema_history"
                 + " WHERE version IS NOT NULL ORDER BY installed_rank");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                rows.add(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getBoolean(3));
            }
        }
        return rows;
    }

    private static boolean tableExists(PostgreSQLContainer pg, String table) throws SQLException {
        return scalarExists(pg, "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = ?", table);
    }

    private static boolean indexExists(PostgreSQLContainer pg, String index) throws SQLException {
        return scalarExists(pg, "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ?", index);
    }

    private static boolean forcesRls(PostgreSQLContainer pg, String table) throws SQLException {
        return scalarExists(pg,
            "SELECT 1 FROM pg_class WHERE relname = ? AND relrowsecurity AND relforcerowsecurity", table);
    }

    private static boolean columnIsNotNull(PostgreSQLContainer pg, String table, String column)
            throws SQLException {
        try (Connection c = connect(pg);
             PreparedStatement ps = c.prepareStatement(
                 "SELECT is_nullable FROM information_schema.columns"
                 + " WHERE table_name = ? AND column_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && "NO".equals(rs.getString(1));
            }
        }
    }

    private static int policyCount(PostgreSQLContainer pg, String table) throws SQLException {
        try (Connection c = connect(pg);
             PreparedStatement ps = c.prepareStatement(
                 "SELECT count(*) FROM pg_policies WHERE tablename = ? AND policyname = 'tenant_isolation'")) {
            ps.setString(1, table);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    private static boolean scalarExists(PostgreSQLContainer pg, String sql, String arg) throws SQLException {
        try (Connection c = connect(pg); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, arg);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }
}
