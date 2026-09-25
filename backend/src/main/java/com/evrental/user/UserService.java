package com.evrental.user;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.PageResponse;
import com.evrental.common.ValidationException;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The S3 CRUD surface: list the caller's tenant's accounts, edit one.
 *
 * <p>Nothing here filters by tenant. RLS does that on the transaction the
 * TenantFilter opened — a fleet admin sees their own tenant's users, a super
 * admin sees the platform tenant's — and a hand-written tenant filter would be
 * a second mechanism to keep in step with the first.
 *
 * <p>Two guardrails, both agreed for S3:
 * <ul>
 *   <li>SUPER_ADMIN is a platform role. Only a super admin may grant it — a
 *       fleet admin setting one of their own users to SUPER_ADMIN is a 403,
 *       not a 422, because it is a privilege question, not a data one.</li>
 *   <li>An admin may edit their own name or email but not disable themselves
 *       or change their own role — the last-admin lockout. A 422 names the
 *       field, so the dialog can highlight it.</li>
 * </ul>
 */
@Service
public class UserService {

    private final UserRepository users;

    public UserService(UserRepository users) {
        this.users = users;
    }

    public PageResponse<UserResponse> list(Pageable pageable) {
        return PageResponse.from(users.findAll(pageable), UserResponse::from);
    }

    @Transactional
    public UserResponse update(UUID id, UpdateUserRequest request, UUID actorUserId, UserRole actorRole) {
        User user = users.findById(id)
                .orElseThrow(() -> NotFoundException.of("User", id));

        // SUPER_ADMIN grant: checked before the self-edit rules, so a tenant
        // admin promoting themselves gets the privilege denial (403), not the
        // self-edit one (422).
        if (actorRole != UserRole.SUPER_ADMIN && request.role() == UserRole.SUPER_ADMIN) {
            throw new AccessDeniedException("Only a super admin can grant the super admin role");
        }

        if (user.getId().equals(actorUserId)) {
            if (request.status() == UserStatus.DISABLED) {
                throw new ValidationException("status", "You cannot disable your own account");
            }
            if (request.role() != user.getRole()) {
                throw new ValidationException("role", "You cannot change your own role");
            }
        }

        // V001 forbids an ACTIVE user with no password. An invited user has
        // none, so activating them is a 422 naming the field, not a constraint
        // violation naming an index.
        if (request.status() == UserStatus.ACTIVE && user.getPasswordHash() == null) {
            throw new ValidationException("status", "This user has no password yet; set one before activating");
        }

        // Email is globally unique (idx_users_email on lower(email)). Checked
        // before the write so the caller gets a 409 naming the field, the same
        // way the vehicle module checks its two unique fields.
        users.findByEmailIgnoreCase(request.email().trim())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ConflictException("This email is already in use", "email");
                });

        user.setName(request.name().trim());
        user.setEmail(request.email().trim());
        user.setRole(request.role());
        user.setStatus(request.status());
        return UserResponse.from(users.save(user));
    }
}