package com.evrental.auth;

import com.evrental.user.UserRole;
import java.util.UUID;

/**
 * What the JWT filter puts in the SecurityContext. The TenantFilter reads
 * {@code tenantId} from here to issue {@code SET LOCAL app.tenant_id}; the
 * role becomes the granted authority ({@code ROLE_<role>}) for the S3 role
 * gate.
 */
public record JwtPrincipal(UUID userId, UUID tenantId, UserRole role) {}