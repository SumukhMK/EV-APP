package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The V003 schema, checked at the level the migration actually promises:
 * the constraints exist, and RLS hides one tenant's bikes from another.
 *
 * <p>Hibernate's ddl-auto: validate already proves the entity mappings match
 * the columns — if they did not, the context would not start and every test in
 * the suite would fail. So this file tests what validate cannot see.
 */
class VehicleSchemaTest extends PostgresTestBase {

    private static final UUID TENANT_A = UUID.fromString("a0000000-0000-0000-0000-00000000000a");
    private static final UUID TENANT_B = UUID.fromString("b0000000-0000-0000-0000-00000000000b");

    @Autowired
    DataSource dataSource;

    @Test
    void theSameRegistryIdMayExistInTwoTenants() {
        seedTenants();
        insertVehicle(TENANT_A, "BLRSS0428", "CH-A-1");
        insertVehicle(TENANT_B, "BLRSS0428", "CH-B-1");

        assertThat(countVehicles("*")).isGreaterThanOrEqualTo(2);
    }

    @Test
    void aRegistryIdCannotRepeatWithinOneTenant() {
        seedTenants();
        insertVehicle(TENANT_A, "BLRSS0429", "CH-A-2");

        assertThatThrownBy(() -> insertVehicle(TENANT_A, "blrss0429", "CH-A-3"))
                .hasMessageContaining("idx_vehicles_registry");
    }

    @Test
    void aTenantCannotSeeAnotherTenantsVehicles() {
        seedTenants();
        insertVehicle(TENANT_A, "BLRSS0430", "CH-A-4");
        insertVehicle(TENANT_B, "BLRSS0431", "CH-B-2");

        // No WHERE tenant_id anywhere. RLS is what must hide the other rows.
        assertThat(countVehicles(TENANT_A.toString())).isEqualTo(1);
        assertThat(countVehicles(TENANT_B.toString())).isEqualTo(1);
        assertThat(countVehicles("")).isZero();
    }

    @Test
    void anUnknownStateIsRefusedByTheCheckConstraint() {
        seedTenants();

        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                            + "battery_type, hub, state, inducted_on) "
                            + "VALUES (?, 'BAD1', 'CH-BAD', 'e-Sprinto', 'Eagle', 'Yuma', 'Hub', "
                            + "'TELEPORTED', CURRENT_DATE)")) {
                ps.setObject(1, TENANT_A);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("chk_vehicle_state");
    }

    private void seedTenants() {
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")) {
                ps.setObject(1, TENANT_A);
                ps.setString(2, "Schema Tenant A");
                ps.setString(3, "schema-a");
                ps.executeUpdate();
                ps.setObject(1, TENANT_B);
                ps.setString(2, "Schema Tenant B");
                ps.setString(3, "schema-b");
                ps.executeUpdate();
            }
            return null;
        });
    }

    private void insertVehicle(UUID tenantId, String registryId, String chassis) {
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                            + "battery_type, hub, state, inducted_on) "
                            + "VALUES (?, ?, ?, 'e-Sprinto', 'Eagle 2', 'Yuma', 'Koramangala', "
                            + "'INDUCTED', CURRENT_DATE)")) {
                ps.setObject(1, tenantId);
                ps.setString(2, registryId);
                ps.setString(3, chassis);
                ps.executeUpdate();
            }
            return null;
        });
    }

    private int countVehicles(String tenant) {
        return onConnection(tenant, conn -> {
            try (PreparedStatement ps = conn.prepareStatement("SELECT count(*) FROM vehicles")) {
                var rs = ps.executeQuery();
                rs.next();
                return rs.getInt(1);
            }
        });
    }

    private <T> T onConnection(String tenant, SqlWork<T> work) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, tenant);
                ps.execute();
            }
            T result = work.run(conn);
            conn.commit();
            return result;
        } catch (SQLException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    @FunctionalInterface
    private interface SqlWork<T> {
        T run(Connection conn) throws SQLException;
    }
}
