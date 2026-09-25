-- V005: the TENANT_ADMIN role is renamed FLEET_ADMIN.
--
-- The role is a stored string guarded by V001's chk_user_role, so the rename
-- is a data migration: drop the constraint, move the rows, re-add it with the
-- new name. V001 itself is untouched -- Flyway checksums make an edited
-- migration a broken database, and every environment (local, test container,
-- deployed) already has V001 applied.

ALTER TABLE users DROP CONSTRAINT chk_user_role;

UPDATE users SET role = 'FLEET_ADMIN' WHERE role = 'TENANT_ADMIN';

ALTER TABLE users ADD CONSTRAINT chk_user_role
  CHECK (role IN ('SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_STAFF', 'SERVICE_MANAGER'));