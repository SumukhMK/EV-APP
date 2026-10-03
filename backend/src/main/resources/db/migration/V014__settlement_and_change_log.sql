-- V014: closing two open loops.
--
-- 1. The settlement a deboard records but nobody could approve.
--
-- S5 writes outstanding_rent_paise and deposit_refund_paise onto the closing
-- assignment row and stops there, deliberately: turning them into money is a
-- Fleet Admin's decision, not an operator's. The decision had nowhere to be
-- recorded, so the figures sat unspent and the ledger said nothing about any
-- settlement that had ever happened.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS settlement_approved_by   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS settlement_approved_on   TIMESTAMPTZ,
  -- The charge the approval raised, so approving twice is impossible and the
  -- row can say which ledger entry it produced.
  ADD COLUMN IF NOT EXISTS settlement_charge_id     UUID REFERENCES rider_charges (id);

-- A settlement charge has no service job behind it, so the two columns that
-- assumed one become nullable. The unique index that stops a job being billed
-- twice is unaffected: Postgres lets a unique index hold many NULLs, so every
-- settlement charge is distinct from every other and from every job charge.
ALTER TABLE rider_charges ALTER COLUMN service_job_id DROP NOT NULL;
ALTER TABLE rider_charges ALTER COLUMN vehicle_id     DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_unapproved
  ON assignments (tenant_id, ended_on)
  WHERE ended_on IS NOT NULL AND settlement_approved_on IS NULL;

-- 2. The two changes the audit trail could not see.
--
-- The trail reads the records modules already write, which is why it cannot
-- drift. Two acts left no record at all: changing a rider's weekly plan, and
-- changing a user's role. Both are written here by the code that performs
-- them, so the trail keeps its one rule — a line means the act happened.

CREATE TABLE rider_plan_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  rider_id      UUID NOT NULL REFERENCES riders (id),
  from_paise    BIGINT NOT NULL,
  to_paise      BIGINT NOT NULL,
  actor_name    VARCHAR(100) NOT NULL,
  occurred_on   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rider_plan_changes ON rider_plan_changes (tenant_id, occurred_on DESC);
SELECT enable_tenant_rls('rider_plan_changes');

CREATE TABLE user_role_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  user_id       UUID NOT NULL REFERENCES users (id),
  from_role     VARCHAR(20) NOT NULL,
  to_role       VARCHAR(20) NOT NULL,
  actor_name    VARCHAR(100) NOT NULL,
  occurred_on   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_role_changes ON user_role_changes (tenant_id, occurred_on DESC);
SELECT enable_tenant_rls('user_role_changes');
