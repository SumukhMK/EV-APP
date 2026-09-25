/**
 * User CRUD, role management, RBAC enforcement on every endpoint.
 *
 * <p>Stage S3 in docs/BUILD.md — owner: SMK. The User entity and repository
 * landed early (S0) because auth needs them; the CRUD surface (invite, edit,
 * list) is stage S3.
 */
package com.evrental.user;