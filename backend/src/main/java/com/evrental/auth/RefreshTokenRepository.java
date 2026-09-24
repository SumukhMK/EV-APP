package com.evrental.auth;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    /**
     * Lookup by token hash. The hash is globally unique (V001), so this is only
     * ever called under the super-admin sentinel — the auth module sets
     * {@code app.tenant_id = '*'} on its transaction first.
     */
    Optional<RefreshToken> findByTokenHash(String tokenHash);
}