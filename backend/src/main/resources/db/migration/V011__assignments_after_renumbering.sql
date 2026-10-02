-- V011: the assignments schema, for the database that recorded V009 without
-- running it.
--
-- This is V009__assignments.sql again, with every statement guarded. It is a
-- no-op everywhere V009 actually ran -- CI, a fresh local compose, any
-- database created after 2026-09-29 -- and exists for exactly one that did
-- not: production.
--
-- What happened (the V010 header has the same story from the other side):
-- the payment-periods script was merged and deployed as V009 on 2026-09-29
-- (PR #11). The backend-dev merge that evening brought in a *different* V009,
-- the assignments table, and renumbered payment to V010. Flyway then saw an
-- applied version 9 whose checksum did not match the file, and FlywayConfig's
-- repair() -- added to get past exactly that error -- rewrote the row's
-- checksum to match V009__assignments.sql. Repair aligns bookkeeping; it does
-- not run anything. So production's history says the assignments migration
-- applied, and its schema says there is no assignments table. ddl-auto:
-- validate would refuse to start on that the moment V010 stopped failing.
--
-- Keep this in step with V009__assignments.sql. If a column is added to
-- assignments later it goes in a new migration, as always -- not here.

CREATE TABLE IF NOT EXISTS assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  rider_id             UUID NOT NULL REFERENCES riders (id),
  vehicle_id           UUID NOT NULL REFERENCES vehicles (id),
  started_on           DATE NOT NULL,
  ended_on             DATE,
  reason               VARCHAR(20),
  return_condition     VARCHAR(10),
  next_vehicle_state   VARCHAR(20),
  note                 TEXT,
  damage_notes         TEXT,
  outstanding_rent_paise  BIGINT,
  deposit_refund_paise    BIGINT,
  closed_by            VARCHAR(100),
  created_on           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_assignment_reason CHECK (reason IS NULL OR reason IN (
    'BREAKDOWN', 'BATTERY_ISSUE', 'ACCIDENT', 'SERVICE_REQUIRED',
    'RIDER_REQUEST', 'UPGRADE', 'OTHER',
    'RECOVERED_BY_TEAM', 'LEFT_AT_HUB', 'LEFT_AT_ROADSIDE',
    'SERVICE_ISSUE', 'PAYMENT_ISSUE', 'WENT_HOME', 'RETURNED')),
  CONSTRAINT chk_assignment_return_condition CHECK (
    return_condition IS NULL OR return_condition IN ('NONE', 'MINOR', 'MAJOR', 'ACCIDENT')),
  CONSTRAINT chk_assignment_next_state CHECK (
    next_vehicle_state IS NULL OR next_vehicle_state IN (
      'INDUCTED', 'READY_TO_DEPLOY', 'DEPLOYED', 'RETURNED', 'RECOVERY',
      'UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT', 'RETIRED')),
  CONSTRAINT chk_assignment_money CHECK (
    coalesce(outstanding_rent_paise, 0) >= 0 AND coalesce(deposit_refund_paise, 0) >= 0),
  CONSTRAINT chk_assignment_period CHECK (
    (ended_on IS NULL AND return_condition IS NULL AND reason IS NULL
      AND next_vehicle_state IS NULL AND damage_notes IS NULL AND closed_by IS NULL)
    OR
    (ended_on IS NOT NULL AND return_condition IS NOT NULL
      AND reason IS NOT NULL AND next_vehicle_state IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_open_rider
  ON assignments (tenant_id, rider_id) WHERE ended_on IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_open_vehicle
  ON assignments (tenant_id, vehicle_id) WHERE ended_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON assignments (tenant_id, vehicle_id, started_on DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_rider   ON assignments (tenant_id, rider_id, started_on DESC);

-- The idempotent helper V010 installed: ENABLE and FORCE are repeatable, and
-- the policy is only created when the table does not already carry it.
SELECT enable_tenant_rls('assignments');
