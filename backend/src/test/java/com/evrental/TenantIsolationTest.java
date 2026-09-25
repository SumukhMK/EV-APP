package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Proves the claim the whole architecture rests on: one tenant cannot read
 * another's rows, and the application is not what stops it.
 *
 * <p>Every query below is a bare {@code SELECT ... FROM users} with no tenant
 * filter at all — the worst thing a repository method could do. If isolation is
 * working, the wrong rows are still not returned. That is the point: this test
 * fails the moment someone drops FORCE on a table, connects as a superuser, or
 * writes a policy that only checks reads.
 */
class TenantIsolationTest extends PostgresTestBase {

    private static final UUID TENANT_A = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID TENANT_B = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Autowired
    DataSource dataSource;

    @BeforeEach
    void seedTwoTenants() {
        // The cleanup runs under the super-admin sentinel on purpose: a DELETE
        // with no tenant set would match no rows and quietly leave the previous
        // method's users behind, and the next insert would then trip the unique
        // email index instead of testing anything.
        clearPreviousRun();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("INSERT INTO tenants (id, name, slug) VALUES (?, 'G1 Mobility', 'g1')", TENANT_A);
        jdbc.update("INSERT INTO tenants (id, name, slug) VALUES (?, 'Rival Fleet', 'rival')", TENANT_B);

        insertUserAs(TENANT_A, "meenakshi@g1mobility.in", "Meenakshi Iyer", "FLEET_ADMIN");
        insertUserAs(TENANT_B, "someone@rivalfleet.in", "Someone Else", "FLEET_ADMIN");
    }

    @Test
    void aTenantSeesOnlyItsOwnRows() {
        assertThat(emailsVisibleAs(TENANT_A.toString())).containsExactly("meenakshi@g1mobility.in");
        assertThat(emailsVisibleAs(TENANT_B.toString())).containsExactly("someone@rivalfleet.in");
    }

    @Test
    void aConnectionWithNoTenantSetSeesNothing() {
        // What an unauthenticated request, or a bug in the tenant filter, looks
        // like. The safe outcome is the default: no rows, not all rows.
        assertThat(emailsVisibleAs(null)).isEmpty();
    }

    @Test
    void theSuperAdminSentinelSeesAcrossTenants() {
        assertThat(emailsVisibleAs("*"))
                .contains("meenakshi@g1mobility.in", "someone@rivalfleet.in");
    }

    @Test
    void aTenantCannotWriteIntoAnotherTenant() {
        // WITH CHECK, not just USING: reading is only half of isolation. Acting
        // as A while claiming to insert for B must fail, not quietly succeed.
        assertThatInsertIsRejected(TENANT_A.toString(), TENANT_B, "smuggled@g1mobility.in");
    }

    // -- helpers ------------------------------------------------------------

    /** Runs a tenant-blind SELECT under the given `app.tenant_id`, in one transaction. */
    private java.util.List<String> emailsVisibleAs(String tenantSetting) {
        java.util.List<String> emails = new java.util.ArrayList<>();
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            setTenant(conn, tenantSetting);
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT email FROM users WHERE email LIKE '%g1mobility.in' OR email LIKE '%rivalfleet.in' ORDER BY email");
                    ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    emails.add(rs.getString(1));
                }
            }
            conn.rollback();
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
        return emails;
    }

    private void assertThatInsertIsRejected(String actingAs, UUID claimedTenant, String email) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            setTenant(conn, actingAs);
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO users (tenant_id, name, email, role, status) VALUES (?, 'Smuggled', ?, 'FLEET_ADMIN', 'INVITED')")) {
                ps.setObject(1, claimedTenant);
                ps.setString(2, email);
                ps.executeUpdate();
                conn.rollback();
                throw new AssertionError("Postgres allowed a write into another tenant — the WITH CHECK clause is missing or wrong");
            } catch (SQLException expected) {
                // 42501 — insufficient privilege. The policy refused the row.
                assertThat(expected.getSQLState()).isEqualTo("42501");
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private void clearPreviousRun() {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            setTenant(conn, "*");
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM users WHERE tenant_id IN (?, ?)")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, TENANT_B);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM tenants WHERE id IN (?, ?)")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, TENANT_B);
                ps.executeUpdate();
            }
            conn.commit();
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Seeds one user, acting as the tenant that owns it so WITH CHECK is satisfied. */
    private void insertUserAs(UUID tenantId, String email, String name, String role) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            setTenant(conn, tenantId.toString());
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO users (tenant_id, name, email, role, status) VALUES (?, ?, ?, ?, 'INVITED')")) {
                ps.setObject(1, tenantId);
                ps.setString(2, name);
                ps.setString(3, email);
                ps.setString(4, role);
                ps.executeUpdate();
            }
            conn.commit();
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * What the TenantFilter will do on every request. `set_config(..., true)` is
     * `SET LOCAL`: it lasts for this transaction only, so a pooled connection
     * cannot hand one tenant's setting to the next request.
     */
    private void setTenant(Connection conn, String value) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            ps.setString(1, value == null ? "" : value);
            ps.execute();
        }
    }
}
