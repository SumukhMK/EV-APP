package com.evrental;

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
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

/**
 * The fixture every user test needs: two tenants plus the platform tenant,
 * each with the accounts the tests act on, and the same two helpers as
 * VehicleTestBase — tokenFor() to sign in through the real endpoint, and
 * superAdmin() to arrange and inspect rows RLS would otherwise hide.
 *
 * <p>The cleanup mirrors VehicleTestBase's order (vehicle tables before users)
 * because the two bases share the same tenant ids and lifecycle events carry a
 * foreign key to users — deleting users first would fail on rows another test
 * class left behind.
 */
@AutoConfigureMockMvc
public abstract class UserTestBase extends PostgresTestBase {

    protected static final UUID TENANT = UUID.fromString("c0000000-0000-0000-0000-00000000000c");
    protected static final UUID OTHER_TENANT = UUID.fromString("d0000000-0000-0000-0000-00000000000d");
    /** V001 seeds the platform's own tenant with this fixed id. */
    protected static final UUID PLATFORM_TENANT = UUID.fromString("00000000-0000-0000-0000-000000000001");

    protected static final String PASSWORD = "test-password-123";
    protected static final String ADMIN_EMAIL = "users-admin@g1mobility.in";
    protected static final String STAFF_EMAIL = "users-staff@g1mobility.in";
    protected static final String SERVICE_MANAGER_EMAIL = "users-service@g1mobility.in";
    protected static final String INVITED_EMAIL = "users-invited@g1mobility.in";
    protected static final String SECOND_ADMIN_EMAIL = "users-admin-2@g1mobility.in";
    protected static final String OTHER_FLEET_ADMIN_EMAIL = "users-other-admin@g1mobility.in";
    protected static final String SUPER_ADMIN_EMAIL = "users-super@g1mobility.in";
    protected static final String PLATFORM_USER_EMAIL = "users-platform@g1mobility.in";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected DataSource dataSource;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected PlatformTransactionManager txManager;

    @BeforeEach
    void seedTenantAndUsers() {
        superAdmin(jdbc -> {
            // Vehicle tables first: lifecycle events reference users, and the
            // shared tenant ids mean another test class may have left rows.
            jdbc.update("DELETE FROM vehicle_lifecycle_events WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM vehicles WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM vehicle_import_rows WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM vehicle_imports WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM users WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            // The platform tenant row itself is V001's, shared by the whole
            // suite — never deleted, only its users.
            jdbc.update("DELETE FROM tenants WHERE id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Users Co', 'users-co', 'ACTIVE')", TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Rival Co', 'rival-co', 'ACTIVE')", OTHER_TENANT);
            insertUser(jdbc, TENANT, "Meenakshi Iyer", ADMIN_EMAIL, "FLEET_ADMIN", "ACTIVE", PASSWORD);
            insertUser(jdbc, TENANT, "Dhananjay", STAFF_EMAIL, "FLEET_STAFF", "ACTIVE", PASSWORD);
            insertUser(jdbc, TENANT, "Abhinandan", SERVICE_MANAGER_EMAIL, "SERVICE_MANAGER", "ACTIVE", PASSWORD);
            insertUser(jdbc, TENANT, "Sana Qureshi", INVITED_EMAIL, "FLEET_STAFF", "INVITED", null);
            insertUser(jdbc, TENANT, "Ravi Shastri", SECOND_ADMIN_EMAIL, "FLEET_ADMIN", "ACTIVE", PASSWORD);
            insertUser(jdbc, OTHER_TENANT, "Rival Admin", OTHER_FLEET_ADMIN_EMAIL, "FLEET_ADMIN", "ACTIVE", PASSWORD);
            insertUser(jdbc, PLATFORM_TENANT, "Priya Menon", SUPER_ADMIN_EMAIL, "SUPER_ADMIN", "ACTIVE", PASSWORD);
            insertUser(jdbc, PLATFORM_TENANT, "Platform Ops", PLATFORM_USER_EMAIL, "FLEET_ADMIN", "ACTIVE", PASSWORD);
            return null;
        });
    }

    private void insertUser(JdbcTemplate jdbc, UUID tenantId, String name, String email,
                            String role, String status, String password) {
        jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                tenantId, name, email, password == null ? null : passwordEncoder.encode(password), role, status);
    }

    protected UUID userIdOf(String email) {
        return superAdmin(jdbc -> jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email));
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