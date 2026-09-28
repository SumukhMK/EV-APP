-- V007: the charge ledger (S6, first half).
--
-- When a service job closes and the rider is on the hook, the cost becomes a
-- row here. That is all this migration does. The weekly payment run, the
-- overdue list and receipts are the *other* half of S6 and are not built,
-- because every one of them needs the rider's name, weekly rent and billing
-- day -- and riders are S2, which does not exist yet.
--
-- rider_id therefore carries no foreign key, the same compromise
-- service_jobs.rider_id already makes: the ledger can be written correctly
-- today and joined to a real rider the day S2 lands.
--
-- There is deliberately no period_start column. Which billing period a charge
-- first appears against depends on the rider's billing day (Monday or
-- Wednesday), which is a rider field. Storing a guess now would be a number
-- the run later has to disagree with, so the period is derived from charged_on
-- when the run is computed and S2 can say which day the rider is on.

CREATE TABLE rider_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants (id),
  -- No FK: riders are S2 and unbuilt. See the header.
  rider_id        UUID NOT NULL,
  service_job_id  UUID NOT NULL REFERENCES service_jobs (id),
  vehicle_id      UUID NOT NULL REFERENCES vehicles (id),
  amount_paise    BIGINT NOT NULL,
  -- RIDER is billed on the next run; DEPOSIT is drawn from what is held and
  -- never appears on a run. COMPANY never reaches this table at all.
  liability       VARCHAR(10) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  charged_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_on      TIMESTAMPTZ,
  created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_rc_liability CHECK (liability IN ('RIDER', 'DEPOSIT')),
  CONSTRAINT chk_rc_status    CHECK (status IN ('OPEN', 'SETTLED')),
  -- A charge of nothing is not a charge; the closing code does not raise one.
  CONSTRAINT chk_rc_amount    CHECK (amount_paise > 0),
  CONSTRAINT chk_rc_settled   CHECK (status <> 'SETTLED' OR settled_on IS NOT NULL)
);

-- One charge per job, forever.
--
-- This is the important line in the file. The charge is raised by an async
-- listener on ServiceJobClosedEvent, and an async listener is exactly the
-- thing that gets retried, redelivered or run twice by two instances. Without
-- this index a redelivery bills the rider a second time for one repair, which
-- is the failure this module must not have. With it, the second insert fails
-- and the listener treats that as "already done".
CREATE UNIQUE INDEX idx_rc_one_per_job ON rider_charges (service_job_id);

CREATE INDEX idx_rc_rider  ON rider_charges (tenant_id, rider_id, status);
CREATE INDEX idx_rc_status ON rider_charges (tenant_id, status, charged_on);

SELECT enable_tenant_rls('rider_charges');
