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
 * V017 against a database holding the checks that passed QC before checks
 * closed themselves: the clean one is closed with a note, the costed repair
 * is left for the fleet to decide who pays.
 *
 * <p>Runs in its own database inside the shared container, under forced RLS
 * like every data migration here, so a backfill that updates nothing would
 * fail this rather than pass it.
 */
class V017ClosePassedChecksTest {

    private static final UUID TENANT = UUID.fromString("e0000000-0000-0000-0000-00000000000e");
    private static final UUID VEHICLE = UUID.fromString("e0000000-0000-0000-0000-0000000000a1");
    private static final UUID VEHICLE_2 = UUID.fromString("e0000000-0000-0000-0000-0000000000a2");

    @Test
    void aCleanPassedCheckIsClosedAndACostedRepairIsLeftAlone() throws Exception {
        PostgreSQLContainer pg = PostgresTestBase.POSTGRES;
        String db = "v017_probe";
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

        migrateTo(url, "016");

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
                // Two bikes, one passed check each: a clean one and a costed repair.
                s.execute("INSERT INTO vehicles (id, tenant_id, registry_id, chassis_number, make, model, "
                        + "battery_type, hub, state, inducted_on) VALUES ('" + VEHICLE_2 + "', '" + TENANT
                        + "', 'BLRSS0002', 'SESEAG03202300002', 'e-Sprinto', 'Ampere', 'Li-ion', 'Whitefield', "
                        + "'READY_TO_DEPLOY', DATE '2025-12-01')");
                s.execute(job(VEHICLE, "Clean check", "NONE", 0, "J01"));
                s.execute(job(VEHICLE_2, "Costed repair", "MINOR", 85000, "J02"));
            }
            app.commit();
        }

        migrateTo(url, "017");

        try (Connection app = DriverManager.getConnection(url, "evrental", "evrental")) {
            app.setAutoCommit(false);
            try (Statement s = app.createStatement()) {
                s.execute("SELECT set_config('app.tenant_id', '*', true)");
                List<String> rows = new ArrayList<>();
                try (ResultSet rs = s.executeQuery(
                        "SELECT job_code, status, coalesce(liability, '-'), closed_on IS NOT NULL "
                                + "FROM service_jobs ORDER BY job_code")) {
                    while (rs.next()) {
                        rows.add(rs.getString(1) + "=" + rs.getString(2) + "/" + rs.getString(3) + "/" + rs.getBoolean(4));
                    }
                }
                assertThat(rows).containsExactly("J01=CLOSED/COMPANY/true", "J02=IN_PROGRESS/-/false");

                try (ResultSet rs = s.executeQuery(
                        "SELECT count(*) FROM service_job_events e JOIN service_jobs j ON j.id = e.job_id "
                                + "WHERE j.job_code = 'J01' AND e.note LIKE 'Check passed earlier%'")) {
                    assertThat(rs.next()).isTrue();
                    assertThat(rs.getLong(1)).as("the closure is in the activity log").isEqualTo(1L);
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

    private static String job(UUID vehicle, String notes, String damage, long costPaise, String code) {
        return "INSERT INTO service_jobs (tenant_id, vehicle_id, source, damage_category, queue, status, "
                + "damage_notes, total_cost_paise, job_code) VALUES ('" + TENANT + "', '" + vehicle
                + "', 'INSPECTION', '" + damage + "', 'READY_TO_DEPLOY', 'IN_PROGRESS', '" + notes + "', "
                + costPaise + ", '" + code + "')";
    }
}
