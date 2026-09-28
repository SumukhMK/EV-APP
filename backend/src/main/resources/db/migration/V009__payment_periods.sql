-- V009: the weekly payment run, collections and receipts (S6, second half).
-- Design: docs/superpowers/specs/2026-09-28-s6-payment-run-design.md
--
-- V007 built the charge ledger: money *owed*. This builds money *billed* —
-- the weekly period a rider is charged for, what came in against it, and the
-- receipt number that proves it.
--
-- The decision that shapes the whole file: a period is FROZEN when the run is
-- generated. The mock derives all three screens from the riders on every read,
-- which means raising a rider's weekly plan silently rewrites a receipt
-- printed six weeks ago. So payment_periods snapshots the calculation, and
-- payment_collections records what arrived. status is a function of the two.
-- A plan change never moves an old week; money landing today still flips last
-- week's row to PAID, because they are different columns.

-- ---------------------------------------------------------------------------
-- rider_charges learns which period it belongs to
-- ---------------------------------------------------------------------------

-- RiderCharge.periodStart is in the frontend contract -- "the billing period
-- this charge should first appear against" -- and it is the single field that
-- separates the two money columns on a run row: serviceCharges are charges
-- landing IN the period, arrears are OPEN charges from BEFORE it. V007 has
-- only charged_on, and deriving the period from it on every read would
-- re-bucket a rider's whole history the day they move between cycles.
ALTER TABLE rider_charges ADD COLUMN period_start DATE;

-- README rule 2. rider_charges and riders both carry FORCE ROW LEVEL SECURITY
-- and Flyway sets no tenant, so without this sentinel the UPDATE below reports
-- "UPDATE 0" on a database that has charges and the migration carries on as
-- though it had worked. V005 already made exactly this mistake.
SELECT set_config('app.tenant_id', '*', true);

-- Snap each existing charge back to the most recent occurrence of its rider's
-- billing day, on or before the day it was charged.
--
-- AT TIME ZONE 'Asia/Kolkata' is load-bearing: charged_on is TIMESTAMPTZ and
-- Flyway's session runs in UTC, so a charge raised at 01:00 IST would
-- otherwise be dated to the previous day and land in the wrong week. The
-- business bills in IST, so the calendar day is an IST calendar day --
-- BillingClock in payment/ makes the same choice on the Java side.
UPDATE rider_charges rc
   SET period_start = (rc.charged_on AT TIME ZONE 'Asia/Kolkata')::date
       - ((EXTRACT(ISODOW FROM rc.charged_on AT TIME ZONE 'Asia/Kolkata')::int
           - CASE r.billing_day WHEN 'MONDAY' THEN 1 ELSE 3 END + 7) % 7)
  FROM riders r
 WHERE r.id = rc.rider_id;

-- The orphans V008 deliberately left behind.
--
-- V008 added fk_rider_charges_rider as NOT VALID precisely because charges
-- written before S2 name riders that do not exist, and said so: reconciling
-- them means deleting rows from a money ledger, which is not a migration's
-- decision. The join above therefore leaves those rows NULL, and SET NOT NULL
-- would then fail and stop the application from starting.
--
-- They are snapped to Monday. Not a guess at the rider's real cycle -- there
-- is no rider to ask -- but a value that keeps the column honest and puts the
-- charge in the week it was actually raised. The day such an orphan is
-- reconciled to a real rider, its period_start is re-stamped with theirs.
UPDATE rider_charges
   SET period_start = (charged_on AT TIME ZONE 'Asia/Kolkata')::date
       - ((EXTRACT(ISODOW FROM charged_on AT TIME ZONE 'Asia/Kolkata')::int - 1 + 7) % 7)
 WHERE period_start IS NULL;

ALTER TABLE rider_charges ALTER COLUMN period_start SET NOT NULL;

-- The run splits the ledger on (rider, status, liability, period).
CREATE INDEX idx_rc_period ON rider_charges (tenant_id, rider_id, status, period_start);

-- ---------------------------------------------------------------------------
-- payment_periods -- the frozen calculation
-- ---------------------------------------------------------------------------

CREATE TABLE payment_periods (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants (id),
  rider_id              UUID NOT NULL REFERENCES riders (id),

  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  billing_day           VARCHAR(10) NOT NULL,

  -- Null until S5. A run row still bills the plan; it just cannot name a bike.
  -- A rider's bike is a property of the open assignment (see Rider.java), so
  -- this is filled from AssignmentQuery at generation time and frozen with the
  -- rest of the row -- an assignment that ends later must not rewrite which
  -- bike last week's bill was for.
  vehicle_id            UUID REFERENCES vehicles (id),

  -- The frozen half. Every one of these is computed once, at generation, and
  -- never recomputed: that is the entire point of the table.
  plan_amount_paise     BIGINT NOT NULL,
  days_billed           INT    NOT NULL,
  per_day_amount_paise  BIGINT NOT NULL,
  billed_amount_paise   BIGINT NOT NULL,
  service_charges_paise BIGINT NOT NULL DEFAULT 0,
  arrears_paise         BIGINT NOT NULL DEFAULT 0,
  total_due_paise       BIGINT NOT NULL,

  -- The mutable half, maintained from payment_collections and nothing else.
  amount_paid_paise     BIGINT NOT NULL DEFAULT 0,
  status                VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  -- Nullable on purpose: the contract says a receipt number is "only
  -- meaningful once something has been paid".
  receipt_no            VARCHAR(40),

  generated_on          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_pp_status CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE')),
  CONSTRAINT chk_pp_billing_day CHECK (billing_day IN ('MONDAY','WEDNESDAY')),
  CONSTRAINT chk_pp_days CHECK (days_billed BETWEEN 0 AND 7),
  CONSTRAINT chk_pp_money CHECK (
    plan_amount_paise >= 0 AND billed_amount_paise >= 0
    AND service_charges_paise >= 0 AND arrears_paise >= 0
    AND total_due_paise >= 0 AND amount_paid_paise >= 0),
  CONSTRAINT chk_pp_window CHECK (period_end > period_start)
);

-- The natural key AND the idempotency guard, in one index.
--
-- Generation happens on read (see PaymentRunService), so two people opening
-- the run screen in the same second both try to generate the same week. The
-- insert is ON CONFLICT DO NOTHING against this index, so the second one is a
-- no-op rather than a duplicate bill.
CREATE UNIQUE INDEX idx_pp_rider_period ON payment_periods (tenant_id, rider_id, period_start);
-- The run screen: every rider in one cycle, for one week.
CREATE INDEX idx_pp_run ON payment_periods (tenant_id, period_start, billing_day);
-- The overdue list.
CREATE INDEX idx_pp_status ON payment_periods (tenant_id, status, period_end);
-- The rider profile's payment history panel, newest period first.
CREATE INDEX idx_pp_rider ON payment_periods (tenant_id, rider_id, period_start DESC);

SELECT enable_tenant_rls('payment_periods');

-- ---------------------------------------------------------------------------
-- payment_collections -- what actually came in
-- ---------------------------------------------------------------------------

-- One row per payment received, never an overwrite. Two partial payments in a
-- week is a real case -- riders pay cash in pieces, which is why PARTIAL is in
-- the status enum -- and a mistyped amount is corrected by a reversing entry,
-- not by editing money in place (WORK_SPLIT.md's standing rule).
CREATE TABLE payment_collections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  period_id            UUID NOT NULL REFERENCES payment_periods (id),
  amount_paise         BIGINT NOT NULL,
  method               VARCHAR(20) NOT NULL,
  reference            VARCHAR(100),
  collected_on         TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_by_user_id UUID REFERENCES users (id),

  CONSTRAINT chk_pc_amount CHECK (amount_paise > 0),
  CONSTRAINT chk_pc_method CHECK (method IN ('UPI','CASH','BANK_TRANSFER'))
);

CREATE INDEX idx_pc_period ON payment_collections (tenant_id, period_id, collected_on);

SELECT enable_tenant_rls('payment_collections');

-- ---------------------------------------------------------------------------
-- receipt_counters -- a receipt book with no holes in it
-- ---------------------------------------------------------------------------

-- Bumped with UPDATE ... RETURNING inside the collection's transaction, which
-- takes a row lock. A Postgres sequence would be simpler and is deliberately
-- not used: a sequence keeps its value when a transaction rolls back, so a
-- failed collection burns a receipt number, and a receipt book with gaps in it
-- is a question nobody wants to answer during an audit.
CREATE TABLE receipt_counters (
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  year      INT  NOT NULL,
  next_no   BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, year)
);

SELECT enable_tenant_rls('receipt_counters');

-- A note on these foreign keys, because V008 had to do the opposite.
--
-- All three tables are new and empty, so their FKs go on VALIDATED, inline in
-- CREATE TABLE. V008 had to write NOT VALID because it was adding constraints
-- to tables that already held rows, and an ADD CONSTRAINT under FORCE ROW
-- LEVEL SECURITY validates against an RLS-filtered view -- which, with no
-- tenant set, is zero rows. Postgres then records a constraint as validated
-- while the data violates it. An inline REFERENCES on an empty table has
-- nothing to scan and cannot tell that lie. Any FK added by a later ALTER must
-- follow README rule 3.
