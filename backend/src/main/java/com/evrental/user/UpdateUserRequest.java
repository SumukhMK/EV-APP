package com.evrental.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The four fields an admin changes at the desk (screen 18), matching
 * {@code UpdateUserRequest} in frontend/app/src/types/user.ts. The id is in
 * the path, not the body — the vehicle module's update works the same way.
 *
 * <p>Email is deliberately not format-validated beyond presence and length:
 * the frontend contract accepts both {@code a@b.c} and {@code a@b} (the mock
 * directory uses {@code @g1} addresses), and a stricter rule here would reject
 * rows the UI can already save.
 */
public record UpdateUserRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 120, message = "Name must be at most 120 characters")
        String name,
        @NotBlank(message = "Email is required")
        @Size(max = 160, message = "Email must be at most 160 characters")
        String email,
        @NotNull(message = "Role is required")
        UserRole role,
        @NotNull(message = "Status is required")
        UserStatus status) {
}