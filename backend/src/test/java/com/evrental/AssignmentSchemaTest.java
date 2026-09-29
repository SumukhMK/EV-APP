package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The V009 schema, checked at the level the migration actually promises: the
 * constraints exist, RLS hides one tenant's assignments from another, the
 * foreign keys name real riders and bikes, and the partial unique indexes make
 * "one rider, one bike" a database fact.
 *
 * <p>Hibernate's ddl-auto: validate already proves the entity mappings match
 * the columns — if they did not, the context would not start and every test in
 * the suite would fail. So this file tests what validate cannot see.
 */
class AssignmentSchemaTest extends PostgresTestBase {

    private static final UUID TENANT_A = UUID.fromString("70000000-0000-0000-0000-000000000007");
    private static final UUID TENANT_B = UUID.fromString("80000000-0000-0000-0000-000000000008");

    @Autowired
    DataSource dataSource;

    /**
     * The tests share the two tenants, so each starts from an empty
     * assignments table for them — a count in one test must never see the
     * rows another test left behind.
     *
     * <p>Riders and vehicles are cleared too: TENANT_A/TENANT_B are shared,
     * fixed UUIDs, and another test class (PaymentRunTestBase) happens to
     * seed the same tenant IDs with its own riders. Without this, a leftover
     * rider from another test class can collide with the phone number this
     * class inserts and fail with a duplicate key error unrelated to what
     * the test is actually checking.
     */
    @BeforeEach
    void clearAssignments() {
        onConnection("*", conn -> {
            // FK-safe order: anything that can reference a rider or vehicle
            // goes first, riders/vehicles last. PaymentRunTestBase seeds the
            // same tenant IDs, so this has to clear its tables too, or a
            // leftover row there can block (or collide with) what this class
            // inserts.
            deleteWhereTenantIn(conn, "payment_collections");
            deleteWhereTenantIn(conn, "payment_periods");
            deleteWhereTenantIn(conn, "receipt_counters");
            deleteWhereTenantIn(conn, "rider_charges");
            deleteWhereTenantIn(conn, "qc_inspections");
            deleteWhereTenantIn(conn, "service_job_items");
            deleteWhereTenantIn(conn, "service_job_events");
            deleteWhereTenantIn(conn, "service_jobs");
            deleteWhereTenantIn(conn, "assignments");
            deleteWhereTenantIn(conn, "riders");
            deleteWhereTenantIn(conn, "vehicle_lifecycle_events");
            deleteWhereTenantIn(conn, "vehicles");
            return null;
        });
    }

    private void deleteWhereTenantIn(Connection conn, String table) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM " + table + " WHERE tenant_id IN (?, ?)")) {
            ps.setObject(1, TENANT_A);
            ps.setObject(2, TENANT_B);
            ps.executeUpdate();
        }
    }

    @Test
    void aTenantCannotSeeAnotherTenantsAssignments() {
        seedTenants();
        UUID riderA = insertRider(TENANT_A, "9000000001");
        UUID riderB = insertRider(TENANT_B, "9000000002");
        UUID vehicleA = insertVehicle(TENANT_A, "BLRSS7001");
        UUID vehicleB = insertVehicle(TENANT_B, "BLRSS8001");
        insertAssignment(TENANT_A, riderA, vehicleA);
        insertAssignment(TENANT_B, riderB, vehicleB);

        // No WHERE tenant_id anywhere. RLS is what must hide the other rows.
        assertThat(countAssignments(TENANT_A.toString())).isEqualTo(1);
        assertThat(countAssignments(TENANT_B.toString())).isEqualTo(1);
        assertThat(countAssignments("")).isZero();
    }

    @Test
    void anAssignmentMustNameARiderThatExists() {
        seedTenants();
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7002");

        assertThatThrownBy(() -> insertAssignment(TENANT_A, UUID.randomUUID(), vehicleId))
                .hasMessageContaining("assignments_rider_id_fkey");
    }

    @Test
    void anAssignmentMustNameAVehicleThatExists() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000003");

        assertThatThrownBy(() -> insertAssignment(TENANT_A, riderId, UUID.randomUUID()))
                .hasMessageContaining("assignments_vehicle_id_fkey");
    }

    @Test
    void anUnknownReasonIsRefused() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000004");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7003");

        assertThatThrownBy(() -> insertClosedAssignment(
                TENANT_A, riderId, vehicleId, "TELEPORTED", "NONE", "QC_PENDING"))
                .hasMessageContaining("chk_assignment_reason");
    }

    @Test
    void anUnknownReturnConditionIsRefused() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000005");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7004");

        assertThatThrownBy(() -> insertClosedAssignment(
                TENANT_A, riderId, vehicleId, "RETURNED", "SPARKLY", "QC_PENDING"))
                .hasMessageContaining("chk_assignment_return_condition");
    }

    @Test
    void anUnknownNextStateIsRefused() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000006");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7005");

        assertThatThrownBy(() -> insertClosedAssignment(
                TENANT_A, riderId, vehicleId, "RETURNED", "NONE", "ORBITING"))
                .hasMessageContaining("chk_assignment_next_state");
    }

    @Test
    void negativeMoneyIsRefused() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000007");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7006");

        assertThatThrownBy(() -> insertClosedAssignment(
                TENANT_A, riderId, vehicleId, "RETURNED", "NONE", "QC_PENDING", -1L, 0L))
                .hasMessageContaining("chk_assignment_money");
    }

    @Test
    void anOpenRowCarriesNoReturnFacts() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000008");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7007");

        // An open row (ended_on null) with a return condition is a row that
        // claims the bike came back while it is still out.
        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on, "
                            + "return_condition) VALUES (?, ?, ?, CURRENT_DATE, 'NONE')")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, riderId);
                ps.setObject(3, vehicleId);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("chk_assignment_period");
    }

    @Test
    void aClosedRowMustCarryTheReturnFacts() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000009");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7008");

        // A closed row (ended_on set) without the return facts is a bike that
        // came back for no recorded reason, in no recorded condition, going
        // nowhere recorded.
        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on, ended_on) "
                            + "VALUES (?, ?, ?, CURRENT_DATE, CURRENT_DATE)")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, riderId);
                ps.setObject(3, vehicleId);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("chk_assignment_period");
    }

    @Test
    void oneOpenAssignmentPerRider() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000010");
        UUID vehicleA = insertVehicle(TENANT_A, "BLRSS7009");
        UUID vehicleB = insertVehicle(TENANT_A, "BLRSS7010");
        insertAssignment(TENANT_A, riderId, vehicleA);

        // The partial unique index, not a read-then-write check, is the
        // guarantee: a second open row for the same rider is refused.
        assertThatThrownBy(() -> insertAssignment(TENANT_A, riderId, vehicleB))
                .hasMessageContaining("idx_assignments_open_rider");
    }

    @Test
    void oneOpenAssignmentPerVehicle() {
        seedTenants();
        UUID riderA = insertRider(TENANT_A, "9000000011");
        UUID riderB = insertRider(TENANT_A, "9000000012");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS7011");
        insertAssignment(TENANT_A, riderA, vehicleId);

        assertThatThrownBy(() -> insertAssignment(TENANT_A, riderB, vehicleId))
                .hasMessageContaining("idx_assignments_open_vehicle");
    }

    @Test
    void aClosedAssignmentFreesTheRider() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000013");
        UUID vehicleA = insertVehicle(TENANT_A, "BLRSS7012");
        UUID vehicleB = insertVehicle(TENANT_A, "BLRSS7013");
        insertClosedAssignment(TENANT_A, riderId, vehicleA, "RETURNED", "NONE", "QC_PENDING");

        // The first row is closed, so the rider is free to take another bike.
        insertAssignment(TENANT_A, riderId, vehicleB);
        assertThat(countAssignments(TENANT_A.toString())).isEqualTo(2);
    }

    private void seedTenants() {
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")) {
                ps.setObject(1, TENANT_A);
                ps.setString(2, "Schema Tenant K");
                ps.setString(3, "schema-k");
                ps.executeUpdate();
                ps.setObject(1, TENANT_B);
                ps.setString(2, "Schema Tenant L");
                ps.setString(3, "schema-l");
                ps.executeUpdate();
            }
            return null;
        });
    }

    private UUID insertRider(UUID tenantId, String phone) {
        return onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO riders (tenant_id, name, phone, status, kyc_status, "
                            + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, "
                            + "payment_mode, platform, onboarded_on, aadhaar_encrypted) "
                            + "VALUES (?, 'Schema Rider', ?, 'ACTIVE', 'PENDING', "
                            + "175000, 300000, 'MONDAY', 'MONDAY', 'UPI', 'Zomato', CURRENT_DATE, "
                            + "'v1:test-iv:test-ciphertext') RETURNING id")) {
                ps.setObject(1, tenantId);
                ps.setString(2, phone);
                var rs = ps.executeQuery();
                rs.next();
                return (UUID) rs.getObject(1);
            }
        });
    }

    private UUID insertVehicle(UUID tenantId, String registryId) {
        return onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                            + "battery_type, hub, state, inducted_on) "
                            + "VALUES (?, ?, ?, 'e-Sprinto', 'Eagle 2', "
                            + "'Yuma', 'Koramangala', 'DEPLOYED', CURRENT_DATE) RETURNING id")) {
                ps.setObject(1, tenantId);
                ps.setString(2, registryId);
                ps.setString(3, "CH-" + registryId);
                var rs = ps.executeQuery();
                rs.next();
                return (UUID) rs.getObject(1);
            }
        });
    }

    private void insertAssignment(UUID tenantId, UUID riderId, UUID vehicleId) {
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on) "
                            + "VALUES (?, ?, ?, CURRENT_DATE)")) {
                ps.setObject(1, tenantId);
                ps.setObject(2, riderId);
                ps.setObject(3, vehicleId);
                ps.executeUpdate();
            }
            return null;
        });
    }

    private void insertClosedAssignment(UUID tenantId, UUID riderId, UUID vehicleId,
                                        String reason, String condition, String nextState) {
        insertClosedAssignment(tenantId, riderId, vehicleId, reason, condition, nextState, 0L, 0L);
    }

    private void insertClosedAssignment(UUID tenantId, UUID riderId, UUID vehicleId,
                                        String reason, String condition, String nextState,
                                        long outstandingRent, long depositRefund) {
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on, ended_on, "
                            + "reason, return_condition, next_vehicle_state, damage_notes, closed_by, "
                            + "outstanding_rent_paise, deposit_refund_paise) "
                            + "VALUES (?, ?, ?, CURRENT_DATE, CURRENT_DATE, ?, ?, ?, 'No damage reported', "
                            + "'Schema Test', ?, ?)")) {
                ps.setObject(1, tenantId);
                ps.setObject(2, riderId);
                ps.setObject(3, vehicleId);
                ps.setString(4, reason);
                ps.setString(5, condition);
                ps.setString(6, nextState);
                ps.setLong(7, outstandingRent);
                ps.setLong(8, depositRefund);
                ps.executeUpdate();
            }
            return null;
        });
    }

    private int countAssignments(String tenant) {
        return onConnection(tenant, conn -> {
            try (PreparedStatement ps = conn.prepareStatement("SELECT count(*) FROM assignments")) {
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