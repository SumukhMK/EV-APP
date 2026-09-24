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
 * The fixture every vehicle test needs: one tenant, one admin, one staff user,
 * and a way to run service code with the tenant set on the transaction.
 *
 * <p>asTenant() exists because a service method called directly from a test has
 * no TenantFilter in front of it, so nothing has issued SET LOCAL app.tenant_id
 * and RLS would hide every row. Requests made through MockMvc do not need it --
 * they go through the real filter chain.
 */
@AutoConfigureMockMvc
public abstract class VehicleTestBase extends PostgresTestBase {

    protected static final UUID TENANT = UUID.fromString("c0000000-0000-0000-0000-00000000000c");
    protected static final UUID OTHER_TENANT = UUID.fromString("d0000000-0000-0000-0000-00000000000d");
    protected static final String PASSWORD = "test-password-123";
    protected static final String ADMIN_EMAIL = "vehicle-admin@g1mobility.in";
    protected static final String STAFF_EMAIL = "vehicle-staff@g1mobility.in";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected DataSource dataSource;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected PlatformTransactionManager txManager;

    protected UUID adminUserId;
    protected UUID staffUserId;

    @BeforeEach
    void seedTenantAndUsers() {
        superAdmin(jdbc -> {
            jdbc.update("DELETE FROM vehicle_lifecycle_events WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicles WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            // Before users: vehicle_imports.uploaded_by references users (id),
            // and import rows cascade from their import.
            jdbc.update("DELETE FROM vehicle_import_rows WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicle_imports WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM users WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM tenants WHERE id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Vehicle Co', 'vehicle-co', 'ACTIVE')", TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Rival Co', 'rival-co', 'ACTIVE')", OTHER_TENANT);
            jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                    + "VALUES (?, 'Meenakshi Iyer', ?, ?, 'TENANT_ADMIN', 'ACTIVE')",
                    TENANT, ADMIN_EMAIL, passwordEncoder.encode(PASSWORD));
            jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                    + "VALUES (?, 'Dhananjay', ?, ?, 'FLEET_STAFF', 'ACTIVE')",
                    TENANT, STAFF_EMAIL, passwordEncoder.encode(PASSWORD));
            return null;
        });
        adminUserId = superAdmin(jdbc ->
                jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, ADMIN_EMAIL));
        staffUserId = superAdmin(jdbc ->
                jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, STAFF_EMAIL));
    }

    /** Runs service code in a transaction with this test's tenant set, as the filter would. */
    protected <T> T asTenant(Supplier<T> work) {
        TransactionTemplate tx = new TransactionTemplate(txManager);
        return tx.execute(status -> {
            new JdbcTemplate(dataSource).queryForObject(
                    "SELECT set_config('app.tenant_id', ?, true)", String.class, TENANT.toString());
            return work.get();
        });
    }

    protected UUID insertVehicle(String registryId, String chassis, VehicleState state) {
        return insertVehicle(TENANT, registryId, chassis, state);
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

    protected void renameUser(UUID userId, String newName) {
        superAdmin(jdbc -> jdbc.update("UPDATE users SET name = ? WHERE id = ?", newName, userId));
    }

    /** A bearer token for the given account, obtained through the real login endpoint. */
    protected String tokenFor(String email) throws Exception {
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return new ObjectMapper().readTree(body).get("accessToken").asText();
    }

    /** Arranges and inspects rows across tenants, which RLS otherwise hides from the test. */
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
