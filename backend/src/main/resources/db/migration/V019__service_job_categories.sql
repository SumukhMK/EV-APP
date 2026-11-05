-- V019: the two job-card boards — docs/backend/SERVICE_INFRA_SPLIT.md,
-- "Decisions taken for the first implementation".
--
-- category is derived from source by the server and never sent by the client,
-- so the two boards stay filtered views over one set of rows: a bike cannot
-- acquire a second, conflicting job by appearing on the other board.
--
-- RLS bypass for the backfill, the same reasoning as V015 and V016: the UPDATE
-- below crosses tenants, and FORCE row-level security hides every row from the
-- migration itself. Transaction-scoped, so it ends with this migration.
SELECT set_config('app.tenant_id', '*', true);

-- The default stays after the backfill on purpose. The dev seeder and the test
-- fixtures insert jobs with hand-written SQL, and the source → category
-- mapping belongs in ServiceJobCategory.of(), not in every INSERT.
ALTER TABLE service_jobs ADD COLUMN category VARCHAR(20) DEFAULT 'HUB';

UPDATE service_jobs
SET category = CASE WHEN source IN ('WALK_IN', 'RSA') THEN 'WALK_IN_RSA' ELSE 'HUB' END;

ALTER TABLE service_jobs ALTER COLUMN category SET NOT NULL;
ALTER TABLE service_jobs ADD CONSTRAINT chk_sj_category
  CHECK (category IN ('WALK_IN_RSA', 'HUB'));

-- Repair only needs no spare part; the other two need at least one part line
-- before the job can close.
ALTER TABLE service_jobs ADD COLUMN repair_type VARCHAR(30) NOT NULL DEFAULT 'REPAIR_ONLY';
ALTER TABLE service_jobs ADD CONSTRAINT chk_sj_repair_type
  CHECK (repair_type IN ('REPAIR_ONLY', 'SPARE_PARTS', 'REPAIR_AND_SPARE_PARTS'));

-- "Ticket Created By (Executive)". Null on older rows and on a job a deboard
-- or an exchange opened, where the first activity line names the actor.
ALTER TABLE service_jobs ADD COLUMN created_by VARCHAR(100);

-- Spare-parts money taken at the counter when a Walk-in & RSA job closes. What
-- is left of the parts bill is what reaches Weekly Payments; labour never does.
ALTER TABLE service_jobs ADD COLUMN parts_paid_paise BIGINT NOT NULL DEFAULT 0;
ALTER TABLE service_jobs ADD CONSTRAINT chk_sj_parts_paid_not_negative
  CHECK (parts_paid_paise >= 0);

-- RECOVERY ("Recovered from rider") is a Hub Service intake the source list
-- never had. Dropped and re-added, because a CHECK cannot be widened in place.
-- service_job_events carries the queue and the vehicle state, not the source,
-- so this is the only constraint that names one.
ALTER TABLE service_jobs DROP CONSTRAINT chk_sj_source;
ALTER TABLE service_jobs ADD CONSTRAINT chk_sj_source CHECK (source IN
  ('DEBOARD', 'EXCHANGE', 'RSA', 'QRT', 'WALK_IN', 'INSPECTION', 'REGISTRY', 'RECOVERY'));

-- Each board reads its own category, newest first, which is exactly the
-- order ServiceJobController asks for.
CREATE INDEX idx_sj_tenant_category ON service_jobs (tenant_id, category, created_on DESC);
