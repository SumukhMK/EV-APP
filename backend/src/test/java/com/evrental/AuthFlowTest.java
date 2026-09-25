package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The S0 auth flow, end to end through the real filter chain: login, refresh
 * with rotation and reuse detection, logout, /me, and the TenantFilter.
 *
 * <p>These run against the same real Postgres as TenantIsolationTest, and the
 * MockMvc request goes through the full Spring Security chain — including the
 * JWT filter and the TenantFilter — so a green test here means the tenant was
 * actually set on the transaction: /me reads the caller's own row, which RLS
 * only shows under the caller's tenant.
 */
@AutoConfigureMockMvc
class AuthFlowTest extends PostgresTestBase {

    private static final UUID TENANT_A = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID TENANT_B = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String PASSWORD = "test-password-123";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    DataSource dataSource;

    @BeforeEach
    void seed() {
        clearPreviousRun();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("INSERT INTO tenants (id, name, slug) VALUES (?, 'G1 Mobility', 'g1')", TENANT_A);
        jdbc.update("INSERT INTO tenants (id, name, slug) VALUES (?, 'Rival Fleet', 'rival')", TENANT_B);
        insertUser(TENANT_A, "meenakshi@g1mobility.in", "Meenakshi Iyer", "FLEET_ADMIN", "ACTIVE");
        insertUser(TENANT_B, "someone@rivalfleet.in", "Someone Else", "FLEET_ADMIN", "ACTIVE");
        insertUser(TENANT_A, "disabled@g1mobility.in", "Disabled User", "FLEET_STAFF", "DISABLED");
    }

    // -- login --------------------------------------------------------------

    @Test
    void loginSucceedsAndReturnsTokensAndUser() throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value("meenakshi@g1mobility.in"))
                .andExpect(jsonPath("$.user.name").value("Meenakshi Iyer"))
                .andExpect(jsonPath("$.user.role").value("FLEET_ADMIN"))
                .andExpect(jsonPath("$.user.status").value("ACTIVE"))
                .andExpect(jsonPath("$.user.lastActiveAt").isNotEmpty())
                // The rail prints the operator beside the user, so login must
                // carry it — otherwise the name is hardcoded on the client and
                // true for exactly one tenant.
                .andExpect(jsonPath("$.user.tenantName").value("G1 Mobility"))
                .andReturn();

        // The access token must actually be usable — /me with it returns the user.
        String accessToken = body(result).get("accessToken").asString();
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("meenakshi@g1mobility.in"))
                .andExpect(jsonPath("$.tenantName").value("G1 Mobility"));
    }

    @Test
    void loginWithWrongPasswordIs401() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in","password":"wrong-password"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void loginWithUnknownEmailIs401() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"nobody@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    void loginAsDisabledUserIs401() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"disabled@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginWithMissingFieldsIs422WithField() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"","password":""}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("email"))
                .andExpect(jsonPath("$.status").value(422));

        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in"}
                                """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("password"));
    }

    // -- /me ----------------------------------------------------------------

    @Test
    void meWithoutTokenIs401() throws Exception {
        mvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Not signed in"));
    }

    @Test
    void meWithGarbageTokenIs401() throws Exception {
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }

    // -- refresh ------------------------------------------------------------

    @Test
    void refreshRotatesAndOldRefreshIsRejected() throws Exception {
        JsonNode login = body(mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andReturn());
        String firstRefresh = login.get("refreshToken").asString();

        MvcResult refreshResult = mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(firstRefresh)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value("meenakshi@g1mobility.in"))
                .andReturn();
        String secondRefresh = body(refreshResult).get("refreshToken").asString();
        assertThat(secondRefresh).isNotEqualTo(firstRefresh);

        // The rotated-away token is dead.
        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(firstRefresh)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void replayedRefreshRevokesTheWholeChain() throws Exception {
        JsonNode login = body(mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andReturn());
        String firstRefresh = login.get("refreshToken").asString();

        // Rotate once: firstRefresh -> secondRefresh.
        JsonNode second = body(mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(firstRefresh)))
                .andExpect(status().isOk())
                .andReturn());
        String secondRefresh = second.get("refreshToken").asString();

        // Rotate again: secondRefresh -> thirdRefresh.
        JsonNode third = body(mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(secondRefresh)))
                .andExpect(status().isOk())
                .andReturn());
        String thirdRefresh = third.get("refreshToken").asString();

        // Replay the already-rotated secondRefresh: refused, and the whole
        // chain — including the live thirdRefresh — is revoked.
        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(secondRefresh)))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(thirdRefresh)))
                .andExpect(status().isUnauthorized());
    }

    // -- logout -------------------------------------------------------------

    @Test
    void logoutRevokesTheRefreshToken() throws Exception {
        JsonNode login = body(mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andReturn());
        String refreshToken = login.get("refreshToken").asString();

        mvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(refreshToken)))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(refreshToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutIsIdempotent() throws Exception {
        mvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"some-token-that-never-existed"}
                                """))
                .andExpect(status().isNoContent());
    }

    // -- tenant filter ------------------------------------------------------

    @Test
    void tenantFilterSetsTheCallersTenant() throws Exception {
        // /me reads the caller's own row, which RLS only shows under the
        // caller's tenant. A 200 here proves the TenantFilter set the tenant on
        // the request transaction — without it the row is invisible and the
        // session looks dead.
        JsonNode login = body(mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"meenakshi@g1mobility.in","password":"%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andReturn());
        String accessToken = login.get("accessToken").asString();

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("meenakshi@g1mobility.in"));
    }

    // -- helpers ------------------------------------------------------------

    private JsonNode body(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private void insertUser(UUID tenantId, String email, String name, String role, String status) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            setTenant(conn, "*");
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                            + "VALUES (?, ?, ?, ?, ?, ?)")) {
                ps.setObject(1, tenantId);
                ps.setString(2, name);
                ps.setString(3, email);
                ps.setString(4, passwordEncoder.encode(PASSWORD));
                ps.setString(5, role);
                ps.setString(6, status);
                ps.executeUpdate();
            }
            conn.commit();
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private void clearPreviousRun() {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            setTenant(conn, "*");
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM refresh_tokens")) {
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM users WHERE tenant_id IN (?, ?)")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, TENANT_B);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM tenants WHERE id IN (?, ?)")) {
                ps.setObject(1, TENANT_A);
                ps.setObject(2, TENANT_B);
                ps.executeUpdate();
            }
            conn.commit();
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private void setTenant(Connection conn, String value) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            ps.setString(1, value);
            ps.execute();
        }
    }
}