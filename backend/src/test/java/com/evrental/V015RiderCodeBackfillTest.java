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
 * V015 against a database that already has riders in it.
 *
 * <p>Every other test migrates an empty database, so a backfill that updates
 * nothing passes them. This one stops at V014, inserts riders the way a live
 * tenant would have them, then applies V015 — which is what happened on the
 * local development database and failed with "column rider_code contains
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
class V015RiderCodeBackfillTest {

    private static final UUID TENANT = UUID.fromString("e0000000-0000-0000-0000-00000000000e");

    @Test
    void existingRidersAreNumberedOldestFirstEvenThoughFlywayRunsUnderForcedRls() throws Exception {
        PostgreSQLContainer pg = PostgresTestBase.POSTGRES;
        String db = "v015_probe";
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

        migrateTo(url, "014");

        // Two riders, as the application would have written them: under the
        // tenant, through RLS. The older one is onboarded second in the file
        // on purpose, so the assertion below is about dates, not insert order.
        try (Connection app = DriverManager.getConnection(url, "evrental", "evrental")) {
            app.setAutoCommit(false);
            try (Statement s = app.createStatement()) {
                s.execute("SELECT set_config('app.tenant_id', '*', true)");
                s.execute("INSERT INTO tenants (id, name, slug, status) VALUES ('" + TENANT
                        + "', 'Backfill Co', 'backfill-co', 'ACTIVE')");
                s.execute(rider("Newer Rider", "9000000002", "2026-02-01"));
                s.execute(rider("Older Rider", "9000000001", "2026-01-01"));
            }
            app.commit();
        }

        migrateTo(url, "015");

        try (Connection app = DriverManager.getConnection(url, "evrental", "evrental")) {
            app.setAutoCommit(false);
            try (Statement s = app.createStatement()) {
                s.execute("SELECT set_config('app.tenant_id', '*', true)");
                List<String> codes = new ArrayList<>();
                try (ResultSet rs = s.executeQuery("SELECT name, rider_code FROM riders ORDER BY onboarded_on")) {
                    while (rs.next()) {
                        codes.add(rs.getString(1) + "=" + rs.getString(2));
                    }
                }
                assertThat(codes).containsExactly("Older Rider=R01", "Newer Rider=R02");

                try (ResultSet rs = s.executeQuery(
                        "SELECT next_no FROM rider_code_counters WHERE tenant_id = '" + TENANT + "'")) {
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

    private static String rider(String name, String phone, String onboardedOn) {
        return "INSERT INTO riders (tenant_id, name, phone, status, kyc_status, plan_amount_paise, "
                + "deposit_held_paise, billing_day, payment_day, payment_mode, platform, onboarded_on, "
                + "aadhaar_encrypted) VALUES ('" + TENANT + "', '" + name + "', '" + phone + "', 'ACTIVE', "
                + "'PENDING', 100000, 200000, 'MONDAY', 'MONDAY', 'UPI', 'Zepto', DATE '" + onboardedOn
                + "', 'ciphertext')";
    }
}
