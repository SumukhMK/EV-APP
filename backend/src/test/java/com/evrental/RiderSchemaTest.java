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
 * The V008 schema, checked at the level the migration actually promises: the
 * constraints exist, RLS hides one tenant's riders from another, the foreign
 * keys V006/V007 left off are now real, and the Aadhaar column is mandatory —
 * every rider on the register has an encrypted Aadhaar, or none at all.
 *
 * <p>Hibernate's ddl-auto: validate already proves the entity mappings match
 * the columns — if they did not, the context would not start and every test in
 * the suite would fail. So this file tests what validate cannot see.
 */
class RiderSchemaTest extends PostgresTestBase {

    private static final UUID TENANT_A = UUID.fromString("30000000-0000-0000-0000-000000000003");
    private static final UUID TENANT_B = UUID.fromString("40000000-0000-0000-0000-000000000004");

    @Autowired
    DataSource dataSource;

    @Test
    void theSamePhoneMayExistInTwoTenants() {
        seedTenants();
        insertRider(TENANT_A, "9000000001");
        insertRider(TENANT_B, "9000000001");

        assertThat(countRiders("*")).isGreaterThanOrEqualTo(2);
    }

    @Test
    void aPhoneCannotRepeatWithinOneTenant() {
        seedTenants();
        insertRider(TENANT_A, "9000000002");

        assertThatThrownBy(() -> insertRider(TENANT_A, "9000000002"))
                .hasMessageContaining("idx_riders_phone");
    }

    @Test
    void aTenantCannotSeeAnotherTenantsRiders() {
        seedTenants();
        insertRider(TENANT_A, "9000000003");
        insertRider(TENANT_B, "9000000004");

        // No WHERE tenant_id anywhere. RLS is what must hide the other rows.
        assertThat(countRiders(TENANT_A.toString())).isEqualTo(1);
        assertThat(countRiders(TENANT_B.toString())).isEqualTo(1);
        assertThat(countRiders("")).isZero();
    }

    @Test
    void anUnknownStatusIsRefusedByTheCheckConstraint() {
        seedTenants();

        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO riders (tenant_id, name, phone, status, kyc_status, "
                            + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, "
                            + "payment_mode, platform, onboarded_on, aadhaar_encrypted) "
                            + "VALUES (?, 'Bad Rider', '9000000005', 'TELEPORTED', 'PENDING', "
                            + "0, 0, 'MONDAY', 'MONDAY', 'UPI', 'Zomato', CURRENT_DATE, 'v1:test-iv:test-ciphertext')")) {
                ps.setObject(1, TENANT_A);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("chk_rider_status");
    }

    @Test
    void anUnknownBillingDayIsRefused() {
        seedTenants();

        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO riders (tenant_id, name, phone, status, kyc_status, "
                            + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, "
                            + "payment_mode, platform, onboarded_on, aadhaar_encrypted) "
                            + "VALUES (?, 'Bad Rider', '9000000006', 'ACTIVE', 'PENDING', "
                            + "0, 0, 'FRIDAY', 'MONDAY', 'UPI', 'Zomato', CURRENT_DATE, 'v1:test-iv:test-ciphertext')")) {
                ps.setObject(1, TENANT_A);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("chk_rider_billing_day");
    }

    @Test
    void negativeMoneyIsRefused() {
        seedTenants();

        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO riders (tenant_id, name, phone, status, kyc_status, "
                            + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, "
                            + "payment_mode, platform, onboarded_on, aadhaar_encrypted) "
                            + "VALUES (?, 'Bad Rider', '9000000007', 'ACTIVE', 'PENDING', "
                            + "-1, 0, 'MONDAY', 'MONDAY', 'UPI', 'Zomato', CURRENT_DATE, 'v1:test-iv:test-ciphertext')")) {
                ps.setObject(1, TENANT_A);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("chk_rider_money");
    }

    @Test
    void everyRiderMustCarryAnEncryptedAadhaar() {
        seedTenants();

        // The column is NOT NULL: a rider without an Aadhaar is a rider the
        // register cannot answer for, and a NULL would be a silent gap in the
        // "every Aadhaar is encrypted" guarantee.
        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO riders (tenant_id, name, phone, status, kyc_status, "
                            + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, "
                            + "payment_mode, platform, onboarded_on) "
                            + "VALUES (?, 'Bad Rider', '9000000009', 'ACTIVE', 'PENDING', "
                            + "0, 0, 'MONDAY', 'MONDAY', 'UPI', 'Zomato', CURRENT_DATE)")) {
                ps.setObject(1, TENANT_A);
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("aadhaar_encrypted");
    }

    @Test
    void aServiceJobMustNameARiderThatExists() {
        seedTenants();
        UUID riderId = insertRider(TENANT_A, "9000000008");
        UUID vehicleId = insertVehicle(TENANT_A, "BLRSS0999", "CH-SCHEMA");

        // A job naming a real rider lands.
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO service_jobs (tenant_id, vehicle_id, rider_id, source, "
                            + "damage_category, queue) VALUES (?, ?, ?, 'DEBOARD', 'MINOR', 'MINOR_REPAIR')")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, vehicleId);
                ps.setObject(3, riderId);
                ps.executeUpdate();
            }
            return null;
        });

        // A second vehicle, so the only thing wrong with the next job is the
        // rider: the one-active-job-per-vehicle index must not fire first.
        UUID otherVehicleId = insertVehicle(TENANT_A, "BLRSS1000", "CH-SCHEMA-2");

        // A job naming a rider that never existed is refused by the FK V006
        // deliberately left off and V008 now adds.
        assertThatThrownBy(() -> onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO service_jobs (tenant_id, vehicle_id, rider_id, source, "
                            + "damage_category, queue) VALUES (?, ?, ?, 'DEBOARD', 'MINOR', 'MINOR_REPAIR')")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, otherVehicleId);
                ps.setObject(3, UUID.randomUUID());
                ps.executeUpdate();
            }
            return null;
        })).hasMessageContaining("fk_service_jobs_rider");
    }

    private void seedTenants() {
        onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")) {
                ps.setObject(1, TENANT_A);
                ps.setString(2, "Schema Tenant I");
                ps.setString(3, "schema-i");
                ps.executeUpdate();
                ps.setObject(1, TENANT_B);
                ps.setString(2, "Schema Tenant J");
                ps.setString(3, "schema-j");
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

    private UUID insertVehicle(UUID tenantId, String registryId, String chassisNumber) {
        return onConnection("*", conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                            + "battery_type, hub, state, inducted_on) "
                            + "VALUES (?, ?, ?, 'e-Sprinto', 'Eagle 2', "
                            + "'Yuma', 'Koramangala', 'DEPLOYED', CURRENT_DATE) RETURNING id")) {
                ps.setObject(1, tenantId);
                ps.setString(2, registryId);
                ps.setString(3, chassisNumber);
                var rs = ps.executeQuery();
                rs.next();
                return (UUID) rs.getObject(1);
            }
        });
    }

    private int countRiders(String tenant) {
        return onConnection(tenant, conn -> {
            try (PreparedStatement ps = conn.prepareStatement("SELECT count(*) FROM riders")) {
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