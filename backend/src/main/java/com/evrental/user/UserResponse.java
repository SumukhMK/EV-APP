package com.evrental.user;

import java.time.Instant;
import java.util.UUID;

/**
 * The wire shape of a user, matching {@code User} in
 * frontend/app/src/types/user.ts field for field: id, name, email, role,
 * status, lastActiveAt, createdOn. UUID and Instant serialize as strings, so
 * the JSON is exactly what the contract types expect.
 *
 * <p>{@code tenantName} is the one addition beyond that contract. The rail
 * prints the operator's name beside the user, and before this it printed a
 * hardcoded string — correct for exactly one tenant and a lie for every other.
 * It is null on the list endpoints, where every row belongs to the caller's
 * own tenant and repeating it per row would say nothing.
 */
public record UserResponse(
        UUID id,
        String name,
        String email,
        UserRole role,
        UserStatus status,
        String tenantName,
        Instant lastActiveAt,
        Instant createdOn) {

    public static UserResponse from(User user) {
        return from(user, null);
    }

    public static UserResponse from(User user, String tenantName) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.getStatus(),
                tenantName,
                user.getLastActiveAt(),
                user.getCreatedOn());
    }
}