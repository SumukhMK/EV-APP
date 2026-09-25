package com.evrental.common;

/**
 * 401. The caller is not who they claim to be: bad credentials at login, a
 * revoked or replayed refresh token, a token whose user row no longer exists.
 *
 * <p>Distinct from the security chain's own 401 (no token at all), which leaves
 * through the entry point in SecurityConfig — but both write the same body
 * shape, because the UI has one error parser.
 */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}