package com.evrental.auth;

import com.evrental.common.UnauthorizedException;
import com.evrental.common.ValidationException;
import com.evrental.user.User;
import com.evrental.user.UserRepository;
import com.evrental.user.UserResponse;
import com.evrental.user.UserStatus;
import java.time.Instant;
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
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate bypassTx;
    private final TransactionTemplate revokeChainTx;

    public AuthService(
            UserRepository users,
            RefreshTokenRepository refreshTokens,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            JdbcTemplate jdbc,
            PlatformTransactionManager txManager) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jdbc = jdbc;
        DefaultTransactionDefinition definition = new DefaultTransactionDefinition();
        definition.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.bypassTx = new TransactionTemplate(txManager, definition);
        // Same isolation, but used for the chain revocation on a replayed
        // token: that work must commit even though the request itself fails,
        // and an exception thrown inside bypassTx would roll it back.
        this.revokeChainTx = new TransactionTemplate(txManager, definition);
    }

    public AuthResponse login(String email, String password) {
        if (email == null || email.isBlank()) {
            throw new ValidationException("email", "Email is required");
        }
        if (password == null || password.isBlank()) {
            throw new ValidationException("password", "Password is required");
        }
        return bypassTx.execute(status -> {
            setBypass();
            User user = users.findByEmailIgnoreCase(email.trim())
                    .filter(u -> u.getStatus() == UserStatus.ACTIVE)
                    .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));
            // One message for both failures: saying which one was wrong hands a
            // stranger a way to probe for valid addresses.
            if (!passwordEncoder.matches(password, user.getPasswordHash())) {
                throw new UnauthorizedException("Invalid email or password");
            }
            user.setLastActiveAt(Instant.now());
            users.save(user);
            return issuePair(user);
        });
    }

    public AuthResponse refresh(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ValidationException("refreshToken", "Refresh token is required");
        }
        return bypassTx.execute(status -> {
            setBypass();
            RefreshToken row = refreshTokens.findByTokenHash(jwtService.sha256(rawToken))
                    .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));

            if (row.getRevokedAt() != null) {
                // A revoked token presented again is a stolen token being
                // replayed. Kill the whole chain — including the live token the
                // thief is sitting on — then refuse. The revocation commits in
                // its own transaction first: throwing inside bypassTx would
                // roll it back along with the failed request. set_config is
                // transaction-scoped, so the new transaction must set the
                // bypass again or RLS hides the chain from it.
                revokeChainTx.executeWithoutResult(ignored -> {
                    setBypass();
                    revokeChain(row);
                });
                throw new UnauthorizedException("Invalid refresh token");
            }
            if (row.getExpiresAt().isBefore(Instant.now())) {
                row.setRevokedAt(Instant.now());
                refreshTokens.save(row);
                throw new UnauthorizedException("Invalid refresh token");
            }

            User user = users.findById(row.getUserId())
                    .filter(u -> u.getStatus() == UserStatus.ACTIVE)
                    .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));

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
            return new AuthResponse(accessToken, newRefreshToken, UserResponse.from(user));
        });
    }

    /** Idempotent: revoking an unknown or already-revoked token is still a 204. */
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
        return UserResponse.from(user);
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
        return new AuthResponse(accessToken, refreshToken, UserResponse.from(user));
    }

    /** Revokes the reused token and every successor in its chain. */
    private void revokeChain(RefreshToken reused) {
        RefreshToken current = reused;
        while (current != null) {
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