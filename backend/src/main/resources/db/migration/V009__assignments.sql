-- V009: the assignment module (S5) — docs/superpowers/plans/2026-09-25-s5-assignments.md.
--
-- One row per period a bike is out with a rider. Assign opens a row; exchange
-- closes one and opens the next; deboard closes one and takes the rider off
-- the active register. The row is the single source of truth for the derived
-- fields the entities deliberately do not store — Rider.currentVehicleId and
-- Vehicle.currentRiderId/currentRiderName — so there is exactly one copy of
-- "who has which bike" and it cannot drift.
--
-- The return facts (reason, condition, destination, notes, the two money
-- figures) are recorded on the closing row. outstanding_rent_paise and
-- deposit_refund_paise are facts for the settlement, which S6's second half
-- turns into ledger rows under FA approval (RBAC.md conflict #4) — S5 writes
-- nothing to the money ledger, which cannot hold a refund.

CREATE TABLE assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  rider_id             UUID NOT NULL REFERENCES riders (id),
  vehicle_id           UUID NOT NULL REFERENCES vehicles (id),
  -- The period. ended_on NULL is what "open" means; the partial unique
  -- indexes below make "open" a database fact, not a convention.
  started_on           DATE NOT NULL,
  ended_on             DATE,
  -- Why the bike came back. Two enums share the column (the exchange and
  -- deboard reasons are different questions); the CHECK names both sets.
  reason               VARCHAR(20),
  -- What shape the bike came back in. Same values as DamageCategory — the
  -- facade routes the bike from this, so one enum serves both sides.
  return_condition     VARCHAR(10),
  -- The destination the operator chose on the form. Recorded as a fact; the
  -- bike actually goes where the damage category routes it (openJob), and an
  -- override of the condition's default is a documented divergence.
  next_vehicle_state   VARCHAR(20),
  note                 TEXT,
  -- The damage detail, joined the way the mock's returnNote joins it
  -- ("part: note; part: note"), and the same string that goes into the job's
  -- damage_notes. "No damage reported" for an undamaged return.
  damage_notes         TEXT,
  -- The settlement facts (decision 1): rent still owed and the deposit
  -- handed back, in paise, at the moment the bike came back. S6's second
  -- half turns them into ledger rows; S5 only records.
  outstanding_rent_paise  BIGINT,
  deposit_refund_paise    BIGINT,
  -- The operator who closed the row, frozen the way lifecycle events freeze
  -- the actor name.
  closed_by            VARCHAR(100),
  created_on           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_assignment_reason CHECK (reason IS NULL OR reason IN (
    -- ExchangeVehicleRequest.reason
    'BREAKDOWN', 'BATTERY_ISSUE', 'ACCIDENT', 'SERVICE_REQUIRED',
    'RIDER_REQUEST', 'UPGRADE', 'OTHER',
    -- DeboardRiderRequest.reason
    'RECOVERED_BY_TEAM', 'LEFT_AT_HUB', 'LEFT_AT_ROADSIDE',
    'SERVICE_ISSUE', 'PAYMENT_ISSUE', 'WENT_HOME', 'RETURNED')),
  CONSTRAINT chk_assignment_return_condition CHECK (
    return_condition IS NULL OR return_condition IN ('NONE', 'MINOR', 'MAJOR', 'ACCIDENT')),
  CONSTRAINT chk_assignment_next_state CHECK (
    next_vehicle_state IS NULL OR next_vehicle_state IN (
      'INDUCTED', 'READY_TO_DEPLOY', 'DEPLOYED', 'RETURNED', 'RECOVERY',
      'UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT', 'RETIRED')),
  -- Money is never negative, and an open row has no money facts yet.
  CONSTRAINT chk_assignment_money CHECK (
    coalesce(outstanding_rent_paise, 0) >= 0 AND coalesce(deposit_refund_paise, 0) >= 0),
  -- The period invariant: an open row carries no return facts, and a closed
  -- row carries the return facts (condition, reason, destination). The money
  -- facts are optional on a close — an exchange has none.
  CONSTRAINT chk_assignment_period CHECK (
    (ended_on IS NULL AND return_condition IS NULL AND reason IS NULL
      AND next_vehicle_state IS NULL AND damage_notes IS NULL AND closed_by IS NULL)
    OR
    (ended_on IS NOT NULL AND return_condition IS NOT NULL
      AND reason IS NOT NULL AND next_vehicle_state IS NOT NULL))
);

-- One rider, one bike — the register's oldest rule, as a database fact.
-- Two operators assigning the same rider at the same moment: the first wins
-- and the second gets a 409 from the index, not from a read-then-write race.
CREATE UNIQUE INDEX idx_assignments_open_rider
  ON assignments (tenant_id, rider_id) WHERE ended_on IS NULL;

-- A bike is out with at most one rider. Same reasoning, same race.
CREATE UNIQUE INDEX idx_assignments_open_vehicle
  ON assignments (tenant_id, vehicle_id) WHERE ended_on IS NULL;

-- The history reads: a bike's assignment history (vehicle detail) and a
-- rider's (future screens), newest first.
CREATE INDEX idx_assignments_vehicle ON assignments (tenant_id, vehicle_id, started_on DESC);
CREATE INDEX idx_assignments_rider   ON assignments (tenant_id, rider_id, started_on DESC);

SELECT enable_tenant_rls('assignments');