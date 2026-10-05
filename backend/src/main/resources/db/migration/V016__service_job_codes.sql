-- V016: friendly, searchable service job ids ("J01", "J02"...), one per tenant.
--
-- service_jobs' primary key is a UUID, and that UUID was what the help desk
-- rows, the vehicle's work-record list and every job URL showed. Riders got
-- the same treatment in V015 (rider_code); this gives jobs the same split, in
-- the same shape: a counter row per tenant, locked for the opening
-- transaction (ServiceJobCodes.next()), so a rollback puts the number back
-- and the numbering has no holes.
--
-- Flyway connects as `evrental` with no app.tenant_id on the transaction, and
-- service_jobs carries FORCE ROW LEVEL SECURITY — without the bypass below
-- the backfill updates zero rows and SET NOT NULL fails on any database that
-- already has jobs. Transaction-scoped: it ends with the migration.
SELECT set_config('app.tenant_id', '*', true);

CREATE TABLE IF NOT EXISTS job_code_counters (
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  next_no   BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id)
);

SELECT enable_tenant_rls('job_code_counters');

ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS job_code VARCHAR(10);

-- Backfill: every existing job gets the next code in its tenant, oldest
-- first, so the longest-standing jobs keep the lowest numbers.
WITH ordered AS (
  SELECT id, tenant_id,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_on, id) AS rn
  FROM service_jobs
)
-- Two digits below 100 and the plain number above, exactly as
-- ServiceJobCodes.next() formats new ones. Not lpad alone: Postgres lpad
-- TRUNCATES to the given length, so the 100th job would have become "J10".
UPDATE service_jobs j
SET job_code = 'J' || CASE WHEN ordered.rn < 100
                           THEN lpad(ordered.rn::text, 2, '0')
                           ELSE ordered.rn::text END
FROM ordered
WHERE j.id = ordered.id;

INSERT INTO job_code_counters (tenant_id, next_no)
SELECT tenant_id, count(*) + 1
FROM service_jobs
GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE SET next_no = excluded.next_no;

ALTER TABLE service_jobs ALTER COLUMN job_code SET NOT NULL;

-- On lower(...) and queried through an explicit lower(:value), the same
-- reasoning idx_riders_code documents.
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_jobs_code ON service_jobs (tenant_id, lower(job_code));
