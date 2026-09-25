/**
 * Login, token refresh, logout, /me. Issues the JWT that carries tenant_id and
 * role, and the opaque refresh token whose SHA-256 hash V001 stores.
 *
 * <p>Stage S0 in docs/BUILD.md — owner: SMK. Built in S0; password reset is
 * still to come (it needs the notification module, S6).
 */
package com.evrental.auth;