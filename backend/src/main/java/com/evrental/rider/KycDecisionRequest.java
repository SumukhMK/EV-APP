package com.evrental.rider;

import jakarta.validation.constraints.NotNull;

/**
 * Verify or reject a rider's documents.
 *
 * <p>A record rather than a path like {@code /kyc/verify}, so the two
 * outcomes share one endpoint and one RBAC rule, and a third outcome later is
 * a new enum value rather than a new route.
 */
public record KycDecisionRequest(
        @NotNull(message = "A decision is required")
        KycStatus decision) {
}
