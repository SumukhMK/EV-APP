-- Creates the role the application actually connects as.
--
-- This is not housekeeping — it is what makes row-level security work at all.
-- A Postgres superuser bypasses every RLS policy, silently and completely, and
-- the bootstrap user a container creates (POSTGRES_USER) is a superuser. So an
-- app that connects as that user has policies on its tables and no isolation
-- whatsoever, which looks exactly like an app that is protected.
--
-- `evrental` is therefore NOSUPERUSER. It owns the schema so Flyway can create
-- tables, and V001 applies FORCE ROW LEVEL SECURITY so that owning a table does
-- not exempt it from its own policy either.
--
-- Run twice: once by docker-compose (mounted into the container's
-- /docker-entrypoint-initdb.d) and once by Testcontainers, from the classpath,
-- so the test database is shaped exactly like the local one. The password is a
-- development password on a database that listens on localhost; deployed
-- environments create this role themselves with a real one.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evrental') THEN
    CREATE ROLE evrental LOGIN PASSWORD 'evrental' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- The database name differs between docker-compose (evrental) and the
-- Testcontainers instance (test), so it is resolved rather than written out.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I OWNER TO evrental', current_database());
END
$$;

ALTER SCHEMA public OWNER TO evrental;
GRANT ALL ON SCHEMA public TO evrental;
