-- V001 — baseline: tenancy, users, refresh tokens, and the row-level security
-- that makes tenancy real.
--
-- The rule from docs/BUILD.md is that a tenant's data is filtered server-side
-- and the frontend is never trusted. This file goes one step further: the
-- filtering is not in application code at all. Every request sets
-- `app.tenant_id` on its transaction, and Postgres refuses to return another
-- tenant's rows even if a repository method forgets its WHERE clause.
--
-- Naming follows the frontend contract in frontend/app/src/types: snake_case
-- here, camelCase on the wire, mapped once by Jackson.

-- ---------------------------------------------------------------------------
-- The RLS pattern, written once
-- ---------------------------------------------------------------------------

-- Reads the tenant the current transaction is acting as. NULL when unset,
-- which is what an unauthenticated or misconfigured connection looks like —
-- and a NULL comparison matches no rows, so the safe outcome is the default.
--
-- The super-admin sentinel '*' also maps to NULL rather than raising: SQL does
-- not promise to short-circuit OR, so a policy reading `tenant_bypass() OR
-- tenant_id = current_tenant_id()` may evaluate this side even when the bypass
-- already answered true. Casting '*' to uuid there would abort the query.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(NULLIF(current_setting('app.tenant_id', true), ''), '*')::uuid
$$;

-- The super-admin escape hatch, and the only one. Platform endpoints set
-- `app.tenant_id = '*'` to read across tenants; every other caller sets a uuid.
-- It is a sentinel rather than a separate database role so that the bypass is
-- visible in a query plan and greppable in the codebase.
CREATE OR REPLACE FUNCTION tenant_bypass() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.tenant_id', true), '') = '*'
$$;

-- Applies the standard policy to a table that carries tenant_id.
--
-- FORCE is the part that is easy to miss: without it, the role that owns the
-- table ignores its own policies, and the application user usually is the
-- owner. A policy that does not apply to the connection actually in use is
-- worse than no policy, because it reads as protection.
CREATE OR REPLACE FUNCTION enable_tenant_rls(target regclass) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format($p$
    CREATE POLICY tenant_isolation ON %s
      USING (tenant_bypass() OR tenant_id = current_tenant_id())
      WITH CHECK (tenant_bypass() OR tenant_id = current_tenant_id())
  $p$, target);
END;
$$;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

-- The tenant table itself is not tenant-scoped: a tenant is the scope. Only
-- platform endpoints read it across rows, and they do so through the bypass.
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  slug          VARCHAR(60)  NOT NULL,
  status        VARCHAR(15)  NOT NULL DEFAULT 'ACTIVE',
  contact_email VARCHAR(160),
  contact_phone VARCHAR(20),
  created_on    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_on    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_tenant_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);

CREATE UNIQUE INDEX idx_tenants_slug ON tenants (lower(slug));

-- The platform's own tenant. Super admins are users like any other and must
-- belong somewhere; this is where they belong. Its id is fixed so that seed
-- data, tests and the bootstrap admin can all refer to it without a lookup.
INSERT INTO tenants (id, name, slug, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform', 'platform', 'ACTIVE');

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Roles are the four in frontend/app/src/types/user.ts, which is the contract
-- of record. (ARCHITECTURE.md still names an older three-role set; the types
-- file is newer and the screens are built against it.)
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants (id),
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  password_hash  VARCHAR(72),          -- BCrypt. NULL until an invited user sets one.
  role           VARCHAR(20)  NOT NULL,
  status         VARCHAR(10)  NOT NULL DEFAULT 'INVITED',
  last_active_at TIMESTAMPTZ,          -- NULL for a user who has never signed in.
  created_on     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_on     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_user_role   CHECK (role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'FLEET_STAFF', 'SERVICE_MANAGER')),
  CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED')),
  -- An active user with no password cannot log in, so the state is a bug, not
  -- a possibility. The database says so.
  CONSTRAINT chk_active_has_password CHECK (status <> 'ACTIVE' OR password_hash IS NOT NULL)
);

-- Login is by email, so it must be globally unique, not unique per tenant:
-- the lookup happens before any tenant is known. Case-insensitive, because
-- people type their own address inconsistently.
CREATE UNIQUE INDEX idx_users_email ON users (lower(email));
CREATE INDEX idx_users_tenant_role ON users (tenant_id, role);

SELECT enable_tenant_rls('users');

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------

-- 15 minute access token, 7 day refresh, rotated on use, revocation recorded
-- rather than deleted (ARCHITECTURE.md). The row survives revocation because
-- "this token was used after it was revoked" is a signal worth keeping.
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 of the token, never the token. A database dump must not hand
  -- anyone a working session.
  token_hash CHAR(64)    NOT NULL,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  -- Set when this token was rotated, pointing at its successor. A whole chain
  -- can then be revoked at once if a stolen token is replayed.
  replaced_by UUID REFERENCES refresh_tokens (id)
);

CREATE UNIQUE INDEX idx_refresh_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

SELECT enable_tenant_rls('refresh_tokens');
