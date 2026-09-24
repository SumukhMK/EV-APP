package com.evrental.auth;

import com.evrental.user.UserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Issues and parses the access JWT, and mints the opaque refresh token.
 *
 * <p>Claims are deliberately minimal (per the S0 contract): {@code sub} (user
 * id), {@code tenant_id}, {@code role}, plus the standard {@code iat},
 * {@code exp}, {@code iss}. No email or name — those go stale inside a token,
 * and /me reads them fresh from the database.
 *
 * <p>The refresh token is not a JWT at all: 32 random bytes, URL-safe base64.
 * Only its SHA-256 hash is stored (V001), so a database dump hands out no
 * working sessions.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final String issuer;
    private final Duration accessTokenTtl;
    private final Duration refreshTokenTtl;
    private final SecureRandom secureRandom = new SecureRandom();

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.issuer}") String issuer,
            @Value("${app.jwt.access-token-ttl}") Duration accessTokenTtl,
            @Value("${app.jwt.refresh-token-ttl}") Duration refreshTokenTtl) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            // HS256 needs a 256-bit key; jjwt would fail at first use with a
            // message that says nothing about the config. Fail at boot instead.
            throw new IllegalStateException(
                    "app.jwt.secret must be at least 32 bytes for HS256, got " + keyBytes.length);
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.issuer = issuer;
        this.accessTokenTtl = accessTokenTtl;
        this.refreshTokenTtl = refreshTokenTtl;
    }

    public String issueAccessToken(UUID userId, UUID tenantId, UserRole role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(issuer)
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTokenTtl)))
                .signWith(key)
                .compact();
    }

    /**
     * Parses and verifies an access token. Throws {@link io.jsonwebtoken.JwtException}
     * (or {@link IllegalArgumentException}) on anything wrong — expired,
     * tampered, wrong issuer, malformed — and the JWT filter turns that into
     * "not signed in".
     */
    public JwtPrincipal parseAccessToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(issuer)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        // A token can be correctly signed and still not be one we can use: a
        // claim renamed between releases, or a role that no longer exists,
        // leaves the signature valid and the payload unusable. Without this,
        // UUID.fromString(null) and UserRole.valueOf(null) throw NPE — which
        // the JWT filter does not catch, so a stale token would come back as a
        // 500 with a stack trace instead of "not signed in".
        try {
            return new JwtPrincipal(
                    UUID.fromString(requireClaim(claims.getSubject(), "sub")),
                    UUID.fromString(requireClaim(claims.get("tenant_id", String.class), "tenant_id")),
                    UserRole.valueOf(requireClaim(claims.get("role", String.class), "role")));
        } catch (IllegalArgumentException e) {
            throw new MalformedJwtException("Token claims are not usable: " + e.getMessage(), e);
        }
    }

    private static String requireClaim(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("missing claim " + name);
        }
        return value;
    }

    /** A fresh opaque refresh token: 32 random bytes, URL-safe base64. */
    public String generateRefreshToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** SHA-256 hex — what V001 stores instead of the token. */
    public String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public Duration refreshTokenTtl() {
        return refreshTokenTtl;
    }
}