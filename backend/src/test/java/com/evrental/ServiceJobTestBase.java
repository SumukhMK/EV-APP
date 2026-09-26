package com.evrental;

import com.evrental.vehicle.VehicleState;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * The fixture every service-job test needs: one tenant, one of each role, and
 * a bike on the road to take into the workshop.
 *
 * <p>Deliberately a sibling of VehicleTestBase rather than a subclass. The two
 * seed overlapping tables and a shared parent would mean one test's cleanup
 * deciding another's fixture — the kind of coupling that makes a failure in
 * one suite show up in the other.
 */
@AutoConfigureMockMvc
public abstract class ServiceJobTestBase extends PostgresTestBase {

    protected static final UUID TENANT = UUID.fromString("e0000000-0000-0000-0000-00000000000e");
    protected static final UUID OTHER_TENANT = UUID.fromString("f0000000-0000-0000-0000-00000000000f");
    protected static final String PASSWORD = "test-password-123";
    protected static final String ADMIN_EMAIL = "service-admin@g1mobility.in";
    protected static final String STAFF_EMAIL = "service-staff@g1mobility.in";
    protected static final String MANAGER_EMAIL = "service-manager@g1mobility.in";

    /** The nine checks, all clear. Tests that want a failure flip one. */
    protected static final String ALL_CHECKS_PASS = """
            {"brakes":true,"tyres":true,"battery":true,"lights":true,"horn":true,
             "mirrors":true,"throttle":true,"frame":true,"roadtest":true}""";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected DataSource dataSource;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected PlatformTransactionManager txManager;

    protected UUID adminUserId;
    protected UUID vehicleId;

    @BeforeEach
    void seedTenantUsersAndBike() {
        superAdmin(jdbc -> {
            // Children first: every one of these references service_jobs, and
            // service_jobs references vehicles and tenants.
            // rider_charges references service_jobs, so it goes first of all.
            jdbc.update("DELETE FROM rider_charges WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM qc_inspections WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM service_job_items WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM service_job_events WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM service_jobs WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicle_lifecycle_events WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicles WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM users WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM tenants WHERE id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Service Co', 'service-co', 'ACTIVE')", TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Other Co', 'other-co', 'ACTIVE')", OTHER_TENANT);
            jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                    + "VALUES (?, 'Meenakshi Iyer', ?, ?, 'FLEET_ADMIN', 'ACTIVE')",
                    TENANT, ADMIN_EMAIL, passwordEncoder.encode(PASSWORD));
            jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                    + "VALUES (?, 'Dhananjay', ?, ?, 'FLEET_STAFF', 'ACTIVE')",
                    TENANT, STAFF_EMAIL, passwordEncoder.encode(PASSWORD));
            jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                    + "VALUES (?, 'Abhinandan', ?, ?, 'SERVICE_MANAGER', 'ACTIVE')",
                    TENANT, MANAGER_EMAIL, passwordEncoder.encode(PASSWORD));
            return null;
        });
        adminUserId = superAdmin(jdbc ->
                jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, ADMIN_EMAIL));
        vehicleId = insertVehicle(TENANT, "BLRSS0428", "CHASSIS0428", VehicleState.DEPLOYED);
    }

    protected UUID insertVehicle(UUID tenantId, String registryId, String chassis, VehicleState state) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                        + "battery_type, battery_vendor, hub, state, inducted_on) "
                        + "VALUES (?, ?, ?, 'e-Sprinto', 'Eagle 2', 'Yuma', 'Yuma', 'Koramangala', ?, "
                        + "CURRENT_DATE) RETURNING id",
                UUID.class, tenantId, registryId, chassis, state.name()));
    }

    protected VehicleState stateOf(UUID vehicleId) {
        return VehicleState.valueOf(superAdmin(jdbc ->
                jdbc.queryForObject("SELECT state FROM vehicles WHERE id = ?", String.class, vehicleId)));
    }

    /** Runs service code with this test's tenant set, as the filter would. */
    protected <T> T asTenant(Supplier<T> work) {
        TransactionTemplate tx = new TransactionTemplate(txManager);
        return tx.execute(status -> {
            new JdbcTemplate(dataSource).queryForObject(
                    "SELECT set_config('app.tenant_id', ?, true)", String.class, TENANT.toString());
            return work.get();
        });
    }

    /** A bearer token for the given account, through the real login endpoint. */
    protected String tokenFor(String email) throws Exception {
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return new ObjectMapper().readTree(body).get("accessToken").asString();
    }

    /** Opens a job with no rider on the bike — a walk-in or a yard find. */
    protected UUID openJob(String token, String registryId, String damage) throws Exception {
        return openJob(token, registryId, damage, null);
    }

    /**
     * Opens a job, optionally with the rider who handed the bike back.
     *
     * <p>The rider matters at closing time: billing RIDER or DEPOSIT when
     * nobody is on the bike bills nobody, and the service refuses it.
     */
    protected UUID openJob(String token, String registryId, String damage, UUID riderId) throws Exception {
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/service/jobs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("""
                                 {"vehicleId":"%s","source":"DEBOARD","damageCategory":"%s",
                                  "damageNotes":"Scratched left panel"%s}
                                 """.formatted(registryId, damage,
                                        riderId == null ? "" : ",\"riderId\":\"" + riderId + "\"")))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(new ObjectMapper().readTree(body).get("id").asString());
    }

    /** Arranges and inspects rows across tenants, which RLS otherwise hides. */
    protected <T> T superAdmin(java.util.function.Function<JdbcTemplate, T> work) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', '*', true)")) {
                ps.execute();
            }
            T result = work.apply(new JdbcTemplate(
                    new org.springframework.jdbc.datasource.SingleConnectionDataSource(conn, true)));
            conn.commit();
            return result;
        } catch (SQLException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }
}
