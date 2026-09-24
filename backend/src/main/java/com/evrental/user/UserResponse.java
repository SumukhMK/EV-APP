package com.evrental.user;

import java.time.Instant;
import java.util.UUID;

/**
 * The wire shape of a user, matching {@code User} in
 * frontend/app/src/types/user.ts field for field: id, name, email, role,
 * status, lastActiveAt, createdOn. UUID and Instant serialize as strings, so
 * the JSON is exactly what the contract types expect.
 */
public record UserResponse(
        UUID id,
        String name,
        String email,
        UserRole role,
        UserStatus status,
        Instant lastActiveAt,
        Instant createdOn) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.getStatus(),
                user.getLastActiveAt(),
                user.getCreatedOn());
    }
}