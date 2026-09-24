package com.evrental.auth;

import jakarta.validation.constraints.NotBlank;

/** POST /api/v1/auth/refresh. */
public record RefreshRequest(
        @NotBlank(message = "Refresh token is required")
        String refreshToken) {}