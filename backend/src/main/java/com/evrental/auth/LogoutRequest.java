package com.evrental.auth;

/**
 * POST /api/v1/auth/logout. Deliberately unvalidated: logout is idempotent, so
 * a missing or blank token is a no-op 204, not an error.
 */
public record LogoutRequest(String refreshToken) {}