-- V006: the service module (S4) — docs/backend/SERVICE_MANAGEMENT.md.
--
-- Numbered V006, not the V003 the design document names: V003 went to
-- vehicles, V004 to vehicle imports and V005 to the FLEET_ADMIN rename. Flyway
-- checksums make a renumbered or edited migration a broken database, so the
-- document is the one that moves.
--
-- vehicle_id is a UUID against vehicles(id), not the VARCHAR(20) registry id
-- the design sketches. registry_id is unique only per tenant, so a bare string
-- is not a key; transitionState() — the only door to a bike's state — takes a
-- UUID; and a VARCHAR link carries no referential integrity, so a job could
-- point at a bike that never existed. The registry id stays on the wire, where
-- the frontend contract expects it.

CREATE TABLE service_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants (id),
  vehicle_id       UUID NOT NULL REFERENCES vehicles (id),
  -- Null for a walk-in or a routine inspection: not every job has a rider on
  -- the hook. No foreign key yet — riders are S2 and are not built.
  rider_id         UUID,
  source           VARCHAR(20) NOT NULL,
  damage_category  VARCHAR(10) NOT NULL,
  queue            VARCHAR(20) NOT NULL,
  status           VARCHAR(15) NOT NULL DEFAULT 'OPEN',
  -- Null until the job closes: who pays is the decision that closing *is*.
  liability        VARCHAR(10),
  work_summary     TEXT NOT NULL DEFAULT '',
  damage_notes     TEXT,
  location         VARCHAR(100),
  reference        VARCHAR(100),
  technician       VARCHAR(100),
  -- Recomputed from the items on every update, then frozen at close.
  total_cost_paise BIGINT NOT NULL DEFAULT 0,
  created_on       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_on        TIMESTAMPTZ,
  updated_on       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_sj_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  CONSTRAINT chk_sj_source CHECK (source IN
    ('DEBOARD', 'EXCHANGE', 'RSA', 'QRT', 'WALK_IN', 'INSPECTION', 'REGISTRY')),
  CONSTRAINT chk_sj_queue CHECK (queue IN
    ('ASSESSMENT', 'MINOR_REPAIR', 'MAJOR_REPAIR', 'ACCIDENT', 'WARRANTY',
     'INSURANCE', 'PARTS_WAITING', 'QC_PENDING', 'READY_TO_DEPLOY')),
  CONSTRAINT chk_sj_liability CHECK (liability IS NULL OR liability IN ('DEPOSIT', 'RIDER', 'COMPANY')),
  CONSTRAINT chk_sj_damage CHECK (damage_category IN ('NONE', 'MINOR', 'MAJOR', 'ACCIDENT')),
  -- A job cannot close without naming who pays. The money module reads this.
  CONSTRAINT chk_sj_closed_has_liability CHECK (status <> 'CLOSED' OR liability IS NOT NULL),
  CONSTRAINT chk_sj_total_not_negative CHECK (total_cost_paise >= 0)
);

CREATE INDEX idx_sj_tenant_status ON service_jobs (tenant_id, status);
CREATE INDEX idx_sj_tenant_queue  ON service_jobs (tenant_id, queue);
CREATE INDEX idx_sj_vehicle       ON service_jobs (vehicle_id);
CREATE INDEX idx_sj_created       ON service_jobs (tenant_id, created_on DESC);

-- Two people deboarding the same bike at the same moment: the first wins and
-- the second gets a 409. The database decides it, not a read-then-write in the
-- application, which is a race however carefully it is written.
CREATE UNIQUE INDEX idx_sj_one_active_per_vehicle
  ON service_jobs (tenant_id, vehicle_id) WHERE status <> 'CLOSED';

-- The activity log. Append-only: a correction is a new row, never an edit.
CREATE TABLE service_job_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  job_id        UUID NOT NULL REFERENCES service_jobs (id),
  queue         VARCHAR(20) NOT NULL,
  vehicle_state VARCHAR(20) NOT NULL,
  actor         VARCHAR(100) NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  occurred_on   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sje_job   ON service_job_events (job_id, occurred_on);
CREATE INDEX idx_sje_actor ON service_job_events (tenant_id, actor, occurred_on);

-- One priced line of work. Replaced wholesale on update; frozen at close.
CREATE TABLE service_job_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  job_id     UUID NOT NULL REFERENCES service_jobs (id) ON DELETE CASCADE,
  label      VARCHAR(200) NOT NULL,
  cost_paise BIGINT NOT NULL,
  kind       VARCHAR(10) NOT NULL DEFAULT 'OTHER',

  CONSTRAINT chk_sji_kind          CHECK (kind IN ('PART', 'LABOUR', 'OTHER')),
  CONSTRAINT chk_sji_cost_positive CHECK (cost_paise >= 0)
);

CREATE INDEX idx_sji_job ON service_job_items (job_id);

-- The QC gate. A bike does not go back to the fleet without passing one.
CREATE TABLE qc_inspections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants (id),
  job_id       UUID NOT NULL REFERENCES service_jobs (id),
  vehicle_id   UUID NOT NULL REFERENCES vehicles (id),
  -- The nine checks, as a JSON object. A column per check would need a
  -- migration every time the workshop adds one; the backend validates the
  -- shape, so the flexibility does not cost correctness.
  checks       JSONB NOT NULL,
  -- True only when every check is true. Stored rather than derived so a past
  -- inspection keeps its verdict even if the required set changes later.
  passed       BOOLEAN NOT NULL,
  inspector    VARCHAR(100) NOT NULL,
  notes        TEXT,
  inspected_on TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_qci_checks_not_empty CHECK (checks <> '{}'::jsonb)
);

CREATE INDEX idx_qci_job     ON qc_inspections (job_id, inspected_on);
CREATE INDEX idx_qci_vehicle ON qc_inspections (vehicle_id);

-- Tenant isolation, through V001's helper rather than a hand-written policy.
-- The helper adds FORCE, and without FORCE the role that owns the table — which
-- the application user is — ignores its own policy, which reads as protection
-- and is not.
SELECT enable_tenant_rls('service_jobs');
SELECT enable_tenant_rls('service_job_events');
SELECT enable_tenant_rls('service_job_items');
SELECT enable_tenant_rls('qc_inspections');
