/**
 * Cross-tenant blacklist, keyed by phone and read across tenants. The one place RLS is intentionally not the answer.
 *
 * <p>Stage S6 in docs/BUILD.md — owner: SMK. Empty until that stage starts;
 * this file exists so the boundary is real from day one and nobody puts a
 * class in the wrong module by accident.
 */
package com.evrental.shared;
