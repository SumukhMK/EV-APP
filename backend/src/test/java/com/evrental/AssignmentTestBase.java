package com.evrental;

import com.evrental.common.AadhaarCipher;
import com.evrental.vehicle.VehicleState;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import java.util.function.Function;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * The fixture every assignment test needs: two tenants plus the platform
 * tenant, each with the accounts the tests act on, riders in the states the
 * rules care about, and bikes in the states the rules care about.
 *
 * <p>Own tenant ids (5000…/6000…), deliberately not the ranges the other bases
 * use — a shared id would mean one test's cleanup deciding another fixture's
 * rows, the coupling ServiceJobTestBase's javadoc warns about.
 */
@AutoConfigureMockMvc
public abstract class AssignmentTestBase extends PostgresTestBase {

    protected static final UUID TENANT = UUID.fromString("50000000-0000-0000-0000-000000000005");
    protected static final UUID OTHER_TENANT = UUID.fromString("60000000-0000-0000-0000-000000000006");
    /** V001 seeds the platform's own tenant with this fixed id. */
    protected static final UUID PLATFORM_TENANT = UUID.fromString("00000000-0000-0000-0000-000000000001");

    protected static final String PASSWORD = "test-password-123";
    protected static final String ADMIN_EMAIL = "assignments-admin@g1mobility.in";
    protected static final String STAFF_EMAIL = "assignments-staff@g1mobility.in";
    protected static final String SERVICE_MANAGER_EMAIL = "assignments-service@g1mobility.in";
    protected static final String OTHER_FLEET_ADMIN_EMAIL = "assignments-other-admin@g1mobility.in";
    protected static final String SUPER_ADMIN_EMAIL = "assignments-super@g1mobility.in";

    /** An ACTIVE rider on TENANT's register, for the happy paths. */
    protected static final UUID RIDER_A = UUID.fromString("50000000-0000-0000-0000-0000000000a1");
    /** The user-facing code for RIDER_A. */
    protected static final String RIDER_A_CODE = "R01";
    /** A second ACTIVE rider, for the one-bike-one-rider rules. */
    protected static final UUID RIDER_C = UUID.fromString("50000000-0000-0000-0000-0000000000c1");
    /** The user-facing code for RIDER_C. */
    protected static final String RIDER_C_CODE = "R02";
    /** A DEBOARDED rider — the status the rules refuse to put a bike on. */
    protected static final UUID RIDER_DEBOARDED = UUID.fromString("50000000-0000-0000-0000-0000000000d1");
    /** The user-facing code for the deboarded rider. */
    protected static final String RIDER_DEBOARDED_CODE = "R03";
    /** An ACTIVE rider on OTHER_TENANT's register — invisible to TENANT's callers. */
    protected static final UUID RIDER_B = UUID.fromString("60000000-0000-0000-0000-0000000000b1");
    /** The user-facing code for RIDER_B within OTHER_TENANT. */
    protected static final String RIDER_B_CODE = "R21";
    /** An ACTIVE rider on the platform tenant, for the super-admin happy path. */
    protected static final UUID RIDER_PLATFORM = UUID.fromString("00000000-0000-0000-0000-0000000000f1");
    /** The user-facing code for RIDER_PLATFORM within PLATFORM_TENANT. */
    protected static final String RIDER_PLATFORM_CODE = "R31";

    /** A bike in the yard, for assigning and exchanging onto. */
    protected static final String VEHICLE_READY = "BLRSS5001";
    /** A second bike in the yard, for exchanges. */
    protected static final String VEHICLE_READY_2 = "BLRSS5002";
    /** A bike already out — the state the rules refuse to assign. */
    protected static final String VEHICLE_DEPLOYED = "BLRSS5003";
    /** A bike on OTHER_TENANT's registry — invisible to TENANT's callers. */
    protected static final String VEHICLE_OTHER = "BLRSS6001";
    /** A bike in the platform tenant's yard, for the super-admin happy path. */
    protected static final String VEHICLE_PLATFORM = "BLRSS0001";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected DataSource dataSource;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected AadhaarCipher aadhaarCipher;

    @BeforeEach
    void seedTenantsUsersRidersAndVehicles() {
        superAdmin(jdbc -> {
            // Assignments reference riders and vehicles; service jobs reference
            // both too; rider_charges reference jobs. Deleted in dependency
            // order, then the rows the fixture owns. payment_periods references
            // riders too — a super-admin payment run bills every active rider
            // across tenants, including this fixture's platform rider — so the
            // payment children go first, the same rule PaymentRunTestBase
            // follows.
            jdbc.update("DELETE FROM payment_collections WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM payment_periods WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM assignments WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM rider_charges WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM qc_inspections WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM service_job_items WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM service_job_events WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM service_jobs WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM vehicle_lifecycle_events WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM vehicles WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            // The change log holds a foreign key to the rider it describes.
            jdbc.update("DELETE FROM rider_plan_changes WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM riders WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            // Same for the role log and the user it describes.
            jdbc.update("DELETE FROM user_role_changes");
            jdbc.update("DELETE FROM users WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            // Reference data holds a foreign key to the tenant, so it goes first.
            jdbc.update("DELETE FROM hubs WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicle_models WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM rider_code_counters WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM job_code_counters WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM tenants WHERE id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Assignments Co', 'assignments-co', 'ACTIVE')", TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Rival Assignments Co', 'rival-assignments-co', 'ACTIVE')", OTHER_TENANT);
            insertUser(jdbc, TENANT, "Meenakshi Iyer", ADMIN_EMAIL, "FLEET_ADMIN", PASSWORD);
            insertUser(jdbc, TENANT, "Dhananjay", STAFF_EMAIL, "FLEET_STAFF", PASSWORD);
            insertUser(jdbc, TENANT, "Abhinandan", SERVICE_MANAGER_EMAIL, "SERVICE_MANAGER", PASSWORD);
            insertUser(jdbc, OTHER_TENANT, "Rival Admin", OTHER_FLEET_ADMIN_EMAIL, "FLEET_ADMIN", PASSWORD);
            insertUser(jdbc, PLATFORM_TENANT, "Priya Menon", SUPER_ADMIN_EMAIL, "SUPER_ADMIN", PASSWORD);
            insertRider(jdbc, RIDER_A, RIDER_A_CODE, TENANT, "Anil Shetty", "9845012277",
                    "ACTIVE", "VERIFIED", 175000, 300000, "MONDAY", "MONDAY", "UPI", "Zomato",
                    "111122223333");
            insertRider(jdbc, RIDER_C, RIDER_C_CODE, TENANT, "Kiran Rao", "9845012288",
                    "ACTIVE", "VERIFIED", 190000, 300000, "MONDAY", "TUESDAY", "UPI", "Swiggy",
                    "111122224444");
            insertRider(jdbc, RIDER_DEBOARDED, RIDER_DEBOARDED_CODE, TENANT, "Vinod Naik", "9008773412",
                    "DEBOARDED", "VERIFIED", 170000, 0, "MONDAY", "SATURDAY", "UPI", "Porter",
                    "111122225555");
            insertRider(jdbc, RIDER_B, RIDER_B_CODE, OTHER_TENANT, "Rival Rider", "9000000002",
                    "ACTIVE", "VERIFIED", 175000, 300000, "MONDAY", "MONDAY", "UPI", "Zomato",
                    "444455556666");
            insertRider(jdbc, RIDER_PLATFORM, RIDER_PLATFORM_CODE, PLATFORM_TENANT, "Platform Rider", "9000000099",
                    "ACTIVE", "VERIFIED", 175000, 300000, "MONDAY", "MONDAY", "UPI", "Zomato",
                    "999988887777");
            jdbc.update("INSERT INTO rider_code_counters (tenant_id, next_no) VALUES (?, 4), (?, 2), (?, 2)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            insertVehicle(jdbc, TENANT, VEHICLE_READY, "CH-5001", VehicleState.READY_TO_DEPLOY);
            insertVehicle(jdbc, TENANT, VEHICLE_READY_2, "CH-5002", VehicleState.READY_TO_DEPLOY);
            insertVehicle(jdbc, TENANT, VEHICLE_DEPLOYED, "CH-5003", VehicleState.DEPLOYED);
            insertVehicle(jdbc, OTHER_TENANT, VEHICLE_OTHER, "CH-6001", VehicleState.READY_TO_DEPLOY);
            insertVehicle(jdbc, PLATFORM_TENANT, VEHICLE_PLATFORM, "CH-0001", VehicleState.READY_TO_DEPLOY);
            return null;
        });
    }

    private void insertUser(JdbcTemplate jdbc, UUID tenantId, String name, String email,
                            String role, String password) {
        jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                tenantId, name, email, passwordEncoder.encode(password), role);
    }

    protected void insertRider(JdbcTemplate jdbc, UUID id, String riderCode, UUID tenantId, String name, String phone,
                               String status, String kycStatus, long planPaise, long depositPaise,
                               String billingDay, String paymentDay, String paymentMode, String platform,
                               String aadhaar) {
        jdbc.update("INSERT INTO riders (id, rider_code, tenant_id, name, phone, status, kyc_status, "
                        + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, payment_mode, "
                        + "platform, onboarded_on, aadhaar_encrypted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?)",
                id, riderCode, tenantId, name, phone, status, kycStatus, planPaise, depositPaise,
                billingDay, paymentDay, paymentMode, platform, aadhaarCipher.encrypt(aadhaar));
    }

    protected String riderCode(UUID riderId) {
        if (RIDER_A.equals(riderId)) {
            return RIDER_A_CODE;
        }
        if (RIDER_C.equals(riderId)) {
            return RIDER_C_CODE;
        }
        if (RIDER_DEBOARDED.equals(riderId)) {
            return RIDER_DEBOARDED_CODE;
        }
        if (RIDER_B.equals(riderId)) {
            return RIDER_B_CODE;
        }
        if (RIDER_PLATFORM.equals(riderId)) {
            return RIDER_PLATFORM_CODE;
        }
        return superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT rider_code FROM riders WHERE id = ?", String.class, riderId));
    }

    protected void insertVehicle(JdbcTemplate jdbc, UUID tenantId, String registryId, String chassis,
                                 VehicleState state) {
        jdbc.update("INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                        + "battery_type, battery_vendor, hub, state, inducted_on) "
                        + "VALUES (?, ?, ?, 'e-Sprinto', 'Eagle 2', 'Yuma', 'Yuma', 'Koramangala', ?, "
                        + "CURRENT_DATE)",
                tenantId, registryId, chassis, state.name());
    }

    /** The bike's state, read across tenants. */
    protected VehicleState stateOf(String registryId) {
        return VehicleState.valueOf(superAdmin(jdbc ->
                jdbc.queryForObject("SELECT state FROM vehicles WHERE registry_id = ?",
                        String.class, registryId)));
    }

    /** Whether the bike has an open service job, read across tenants. */
    protected boolean hasOpenJob(String registryId) {
        return Boolean.TRUE.equals(superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM service_jobs sj
                    JOIN vehicles v ON v.id = sj.vehicle_id
                    WHERE v.registry_id = ? AND sj.status = 'OPEN')
                """, Boolean.class, registryId)));
    }

    /** A bearer token for the given account, obtained through the real login endpoint. */
    protected String tokenFor(String email) throws Exception {
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return new ObjectMapper().readTree(body).get("accessToken").asString();
    }

    /** Arranges and inspects rows across tenants, which RLS otherwise hides from the test. */
    protected <T> T superAdmin(Function<JdbcTemplate, T> work) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', '*', true)")) {
                ps.execute();
            }
            T result = work.apply(new JdbcTemplate(new SingleConnectionDataSource(conn, true)));
            conn.commit();
            return result;
        } catch (SQLException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }
}