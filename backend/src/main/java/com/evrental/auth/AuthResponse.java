package com.evrental.auth;

import com.evrental.user.UserResponse;

/**
 * The body of login and refresh: the access token the browser sends as
 * {@code Authorization: Bearer <accessToken>}, the opaque refresh token the
 * client stores for the next refresh, and the user — so the UI can render the
 * session without a second round trip.
 */
public record AuthResponse(String accessToken, String refreshToken, UserResponse user) {}