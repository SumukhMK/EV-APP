package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.auth.AuthResponse;
import com.evrental.auth.AuthService;
import com.evrental.auth.JwtService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The cases the first pass at S0 auth did not cover, one test per defect found
 * in review. AuthFlowTest owns the happy paths; this file owns the edges, so
 * the two can be read separately and neither grows into a catch-all.
 *
 * <p>Each test names the thing that would break if the fix were reverted — not
 * the mechanism, which the production code already explains.
 */
@AutoConfigureMockMvc
class AuthHardeningTest extends PostgresTestBase {

    private static final UUID TENANT = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final String PASSWORD = "test-password-123";
    private static final String EMAIL = "hardening@g1mobility.in";

    /** Matches src/test/resources/application.yml. */
    private static final String TEST_SECRET = "test-signing-key-used-only-by-the-test-suite";

    @Autowired
    MockMvc mvc;

    @Autowired
    AuthService authService;

    @Autowired
    JwtService jwtService;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    DataSource dataSource;

    private UUID userId;

    @BeforeEach
    void seed() {
        asSuperAdmin(jdbc -> {
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id = ?", TENANT);
            jdbc.update("DELETE FROM users WHERE tenant_id = ?", TENANT);
            jdbc.update("DELETE FROM tenants WHERE id = ?", TENANT);
            jdbc.update(
                    "INSERT INTO tenants (id, name, slug, status) VALUES (?, 'Hardening Co', 'hardening', 'ACTIVE')",
                    TENANT);
            jdbc.update(
                    "INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                            + "VALUES (?, 'Hardening User', ?, ?, 'TENANT_ADMIN', 'ACTIVE')",
                    TENANT, EMAIL, passwordEncoder.encode(PASSWORD));
        });
        userId = asSuperAdminQuery(jdbc ->
                jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, EMAIL));
    }

    // -- a suspended tenant cannot sign in, or stay signed in ---------------

    @Test
    void loginIsRefusedOnceTheTenantIsSuspended() throws Exception {
        suspendTenant();

        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + EMAIL + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshIsRefusedAndTheChainDiesWhenTheTenantIsSuspendedMidSession() {
        AuthResponse session = authService.login(EMAIL, PASSWORD);
        suspendTenant();

        assertThatRefreshIsRefused(session.refreshToken());

        // Not merely refused — revoked. A suspended tenant whose tokens stayed
        // live would be back the moment the suspension lifted, on a session
        // nobody re-authenticated.
        Integer live = asSuperAdminQuery(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE tenant_id = ? AND revoked_at IS NULL",
                Integer.class, TENANT));
        assertThat(live).isZero();
    }

    // -- an expired token is recorded as dead, not left to be re-checked ----

    @Test
    void anExpiredRefreshTokenIsRecordedAsRevoked() {
        String rawToken = jwtService.generateRefreshToken();
        String hash = jwtService.sha256(rawToken);
        Instant expiredYesterday = Instant.now().minus(1, ChronoUnit.DAYS);
        asSuperAdmin(jdbc -> jdbc.update(
                "INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, issued_at, expires_at) "
                        + "VALUES (?, ?, ?, ?, ?)",
                TENANT, userId, hash,
                Timestamp.from(expiredYesterday.minus(7, ChronoUnit.DAYS)),
                Timestamp.from(expiredYesterday)));

        assertThatRefreshIsRefused(rawToken);

        // The write used to be rolled back by the 401 thrown on top of it, so
        // the row stayed in the "active token" partial index for ever.
        Instant revokedAt = asSuperAdminQuery(jdbc -> jdbc.queryForObject(
                "SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?", Timestamp.class, hash))
                .toInstant();
        assertThat(revokedAt).isNotNull();
    }

    // -- rotation is atomic --------------------------------------------------

    @Test
    void twoRefreshesOfTheSameTokenAtOnceProduceExactlyOneSession() throws Exception {
        AuthResponse session = authService.login(EMAIL, PASSWORD);
        String rawToken = session.refreshToken();

        CountDownLatch bothReady = new CountDownLatch(2);
        Callable<Boolean> attempt = () -> {
            bothReady.countDown();
            bothReady.await();
            try {
                authService.refresh(rawToken);
                return true;
            } catch (RuntimeException refused) {
                return false;
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Boolean>> results = pool.invokeAll(List.of(attempt, attempt));
            long succeeded = 0;
            for (Future<Boolean> result : results) {
                if (result.get()) {
                    succeeded++;
                }
            }
            // Without the row lock both callers pass the "not revoked" check
            // and both rotate: one token becomes two live chains, and the
            // replay this design exists to catch never registers.
            assertThat(succeeded).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    // -- a signed token can still be unusable ------------------------------

    @Test
    void aCorrectlySignedTokenWithNoTenantClaimIs401NotA500() throws Exception {
        String tokenMissingTenant = Jwts.builder()
                .issuer("ev-rental-api")
                .subject(userId.toString())
                .claim("role", "TENANT_ADMIN")
                .issuedAt(new Date())
                .expiration(Date.from(Instant.now().plus(15, ChronoUnit.MINUTES)))
                .signWith(Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();

        // Signature valid, claims unusable — a token issued before a claim
        // rename looks exactly like this, and it is a dead session, not a
        // server fault.
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + tokenMissingTenant))
                .andExpect(status().isUnauthorized());
    }

    // -- helpers ------------------------------------------------------------

    private void assertThatRefreshIsRefused(String rawToken) {
        try {
            authService.refresh(rawToken);
            throw new AssertionError("Expected the refresh to be refused");
        } catch (RuntimeException expected) {
            assertThat(expected.getMessage()).isEqualTo("Invalid refresh token");
        }
    }

    private void suspendTenant() {
        asSuperAdmin(jdbc -> jdbc.update("UPDATE tenants SET status = 'SUSPENDED' WHERE id = ?", TENANT));
    }

    /**
     * Runs the given work on a connection with the super-admin sentinel set, in
     * its own committed transaction — the test has to reach across tenants to
     * arrange and inspect rows that RLS otherwise hides from it.
     */
    private void asSuperAdmin(java.util.function.Consumer<JdbcTemplate> work) {
        asSuperAdminQuery(jdbc -> {
            work.accept(jdbc);
            return null;
        });
    }

    private <T> T asSuperAdminQuery(java.util.function.Function<JdbcTemplate, T> work) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', '*', true)")) {
                ps.execute();
            }
            T result = work.apply(new JdbcTemplate(new SingleConnectionDataSource(conn)));
            conn.commit();
            return result;
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    /** A DataSource that hands back the one connection the sentinel is set on. */
    private static final class SingleConnectionDataSource
            extends org.springframework.jdbc.datasource.SingleConnectionDataSource {
        SingleConnectionDataSource(Connection connection) {
            super(connection, true);
        }
    }
}
