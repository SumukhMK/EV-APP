package com.evrental.auth;

import com.evrental.common.UnauthorizedException;
import com.evrental.common.ValidationException;
import com.evrental.platform.Tenant;
import com.evrental.platform.TenantRepository;
import com.evrental.user.User;
import com.evrental.user.UserRepository;
import com.evrental.user.UserResponse;
import com.evrental.user.UserStatus;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.DefaultTransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Login, refresh with rotation, logout, /me.
 *
 * <p>Login and refresh look up by email and by token hash respectively — both
 * globally unique (V001) — so they run in their own transaction under the
 * super-admin sentinel {@code '*'} (the documented escape hatch, used
 * deliberately). {@code REQUIRES_NEW} keeps that transaction separate from the
 * request transaction the TenantFilter opened, so a failed login rolls back
 * only its own work and never marks the request transaction rollback-only.
 *
 * <p>{@code me()} is different: it reads the caller's own row, which RLS makes
 * visible under the caller's tenant, so it runs in the request transaction with
 * no bypass at all.
 *
 * <p>One rule holds throughout: <b>nothing throws inside a transaction
 * callback that has already written something we intend to keep.</b> A refusal
 * is carried out as a {@code null} return and turned into a 401 after the
 * transaction has committed. Replay detection revokes a whole token chain and
 * then refuses; if the refusal were thrown from inside the callback, the
 * revocation would roll back with it and the stolen token would stay live.
 */
@Service
public class AuthService {

    /**
     * The message every credential failure returns. Saying which half was
     * wrong — or that the address is unknown, or the account disabled, or the
     * tenant suspended — hands a stranger a way to enumerate accounts.
     */
    private static final String BAD_CREDENTIALS = "Invalid email or password";

    private static final String BAD_REFRESH_TOKEN = "Invalid refresh token";

    private final UserRepository users;
    private final TenantRepository tenants;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate bypassTx;

    /**
     * A real BCrypt hash of a value nobody knows, verified against whenever the
     * email is unknown. Without it, an unknown address returns before any
     * hashing happens and a known one pays ~100ms of BCrypt — the identical
     * error message then leaks through the clock instead of the body.
     */
    private final String timingDecoyHash;

    public AuthService(
            UserRepository users,
            TenantRepository tenants,
            RefreshTokenRepository refreshTokens,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            JdbcTemplate jdbc,
            PlatformTransactionManager txManager) {
        this.users = users;
        this.tenants = tenants;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jdbc = jdbc;
        DefaultTransactionDefinition definition = new DefaultTransactionDefinition();
        definition.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.bypassTx = new TransactionTemplate(txManager, definition);
        this.timingDecoyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public AuthResponse login(String email, String password) {
        if (email == null || email.isBlank()) {
            throw new ValidationException("email", "Email is required");
        }
        if (password == null || password.isBlank()) {
            throw new ValidationException("password", "Password is required");
        }
        AuthResponse response = bypassTx.execute(status -> {
            setBypass();
            User user = users.findByEmailIgnoreCase(email.trim())
                    .filter(u -> u.getStatus() == UserStatus.ACTIVE)
                    .filter(this::tenantIsActive)
                    .orElse(null);
            if (user == null) {
                // Burn the same BCrypt cost the happy path would have, so the
                // response time says nothing about whether the address exists.
                passwordEncoder.matches(password, timingDecoyHash);
                return null;
            }
            if (!passwordEncoder.matches(password, user.getPasswordHash())) {
                return null;
            }
            user.setLastActiveAt(Instant.now());
            users.save(user);
            return issuePair(user);
        });
        if (response == null) {
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        return response;
    }

    public AuthResponse refresh(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ValidationException("refreshToken", "Refresh token is required");
        }
        AuthResponse response = bypassTx.execute(status -> {
            setBypass();
            // Locked for update: rotation is read-then-write, and two
            // concurrent refreshes of the same token would otherwise both pass
            // the revoked check and both rotate. See RefreshTokenRepository.
            RefreshToken row = refreshTokens.findByTokenHash(jwtService.sha256(rawToken)).orElse(null);
            if (row == null) {
                return null;
            }

            if (row.getRevokedAt() != null) {
                // A revoked token presented again is a stolen token being
                // replayed. Kill the whole chain — including the live token the
                // thief is sitting on — and refuse. The refusal is a null
                // return rather than a throw precisely so this revocation
                // commits.
                revokeChain(row);
                return null;
            }
            if (row.getExpiresAt().isBefore(Instant.now())) {
                row.setRevokedAt(Instant.now());
                refreshTokens.save(row);
                return null;
            }

            User user = users.findById(row.getUserId())
                    .filter(u -> u.getStatus() == UserStatus.ACTIVE)
                    .filter(this::tenantIsActive)
                    .orElse(null);
            if (user == null) {
                // The session outlived the account or the tenant. Revoke the
                // chain rather than leaving a token that refreshes forever
                // against a disabled user.
                revokeChain(row);
                return null;
            }

            // Rotate: revoke this row, point it at its successor.
            row.setRevokedAt(Instant.now());
            String newRefreshToken = jwtService.generateRefreshToken();
            RefreshToken successor = new RefreshToken();
            successor.setTenantId(row.getTenantId());
            successor.setUserId(row.getUserId());
            successor.setTokenHash(jwtService.sha256(newRefreshToken));
            successor.setIssuedAt(Instant.now());
            successor.setExpiresAt(Instant.now().plus(jwtService.refreshTokenTtl()));
            refreshTokens.save(successor);
            row.setReplacedBy(successor.getId());
            refreshTokens.save(row);

            String accessToken = jwtService.issueAccessToken(user.getId(), user.getTenantId(), user.getRole());
            return new AuthResponse(accessToken, newRefreshToken, UserResponse.from(user, tenantNameOf(user)));
        });
        if (response == null) {
            throw new UnauthorizedException(BAD_REFRESH_TOKEN);
        }
        return response;
    }

    /**
     * Idempotent: revoking an unknown or already-revoked token is still a 204.
     *
     * <p>This ends the refresh chain, not the access token the caller is
     * holding. That one is a signed JWT with no server-side state behind it, so
     * it stays valid until it expires — at most {@code app.jwt.access-token-ttl}
     * (15 minutes). The same window applies to disabling a user or changing a
     * role: the change takes effect on the next refresh, not instantly. Closing
     * it needs a token denylist or a per-user token generation, and that is a
     * deliberate not-yet, not an oversight.
     */
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        bypassTx.executeWithoutResult(status -> {
            setBypass();
            refreshTokens.findByTokenHash(jwtService.sha256(rawToken))
                    .filter(t -> t.getRevokedAt() == null)
                    .ifPresent(t -> {
                        t.setRevokedAt(Instant.now());
                        refreshTokens.save(t);
                    });
        });
    }

    /**
     * The caller's own profile. Runs in the request transaction, under the
     * caller's tenant — RLS shows them their own row and nothing else. A token
     * whose user row is gone (deleted, or a tenant mismatch) is a dead session.
     */
    public UserResponse me(UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));
        return UserResponse.from(user, tenantNameOf(user));
    }

    /**
     * A suspended or closed tenant cannot sign in, and cannot refresh an
     * existing session either — otherwise suspending a tenant would leave every
     * already-signed-in user working for another seven days.
     */
    private boolean tenantIsActive(User user) {
        return tenants.findById(user.getTenantId())
                .map(Tenant::getStatus)
                .filter("ACTIVE"::equals)
                .isPresent();
    }

    /**
     * The operator's name, for the rail to print beside the signed-in user.
     * Falls back to empty rather than failing the sign-in: a missing tenant
     * name is a cosmetic problem, and refusing a valid login over one would
     * not be.
     */
    private String tenantNameOf(User user) {
        return tenants.findById(user.getTenantId())
                .map(Tenant::getName)
                .orElse("");
    }

    private AuthResponse issuePair(User user) {
        String accessToken = jwtService.issueAccessToken(user.getId(), user.getTenantId(), user.getRole());
        String refreshToken = jwtService.generateRefreshToken();
        RefreshToken row = new RefreshToken();
        row.setTenantId(user.getTenantId());
        row.setUserId(user.getId());
        row.setTokenHash(jwtService.sha256(refreshToken));
        row.setIssuedAt(Instant.now());
        row.setExpiresAt(Instant.now().plus(jwtService.refreshTokenTtl()));
        refreshTokens.save(row);
        return new AuthResponse(accessToken, refreshToken, UserResponse.from(user, tenantNameOf(user)));
    }

    /**
     * Revokes the given token and every successor in its chain.
     *
     * <p>The visited set is not defensive clutter: {@code replaced_by} is a
     * plain self-reference with nothing in the schema forbidding a cycle, and a
     * cycle here would be an infinite loop inside a database transaction.
     */
    private void revokeChain(RefreshToken reused) {
        Set<UUID> visited = new HashSet<>();
        RefreshToken current = reused;
        while (current != null && visited.add(current.getId())) {
            if (current.getRevokedAt() == null) {
                current.setRevokedAt(Instant.now());
                refreshTokens.save(current);
            }
            current = current.getReplacedBy() == null
                    ? null
                    : refreshTokens.findById(current.getReplacedBy()).orElse(null);
        }
    }

    private void setBypass() {
        // set_config returns the new value, so this is a query, not an update.
        jdbc.queryForObject("SELECT set_config('app.tenant_id', '*', true)", String.class);
    }
}
