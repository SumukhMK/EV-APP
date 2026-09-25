/**
 * Super-admin surface: tenants, subscription plans, fleet-owner inquiries, cross-tenant analytics. Bypasses RLS deliberately and explicitly.
 *
 * <p>Stage S0 in docs/BUILD.md — owner: SMK. The Tenant entity and the
 * BootstrapData seed landed in S0; the platform CRUD surface is a later stage.
 */
package com.evrental.platform;