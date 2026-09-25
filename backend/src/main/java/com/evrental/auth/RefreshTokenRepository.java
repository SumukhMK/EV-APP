package com.evrental.auth;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    /**
     * Lookup by token hash, taking a row lock. The hash is globally unique
     * (V001), so this is only ever called under the super-admin sentinel — the
     * auth module sets {@code app.tenant_id = '*'} on its transaction first.
     *
     * <p>The lock is the point. Rotation is read-then-write: check
     * {@code revoked_at IS NULL}, then revoke and issue a successor. Two
     * requests presenting the same token concurrently — which a browser does
     * routinely, when two calls 401 at once and both retry — would otherwise
     * both pass the check and both rotate, leaving one successor orphaned and
     * the client holding a token that is about to look like a replay. Under
     * {@code SELECT ... FOR UPDATE} the second request blocks, then reads the
     * row the first one revoked, and is correctly refused as a replay.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByTokenHash(String tokenHash);
}
