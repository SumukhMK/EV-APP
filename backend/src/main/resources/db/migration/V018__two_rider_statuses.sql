-- V018: a rider is ACTIVE (holding a bike) or INACTIVE (on the register, no
-- bike) — and nothing else.
--
-- Seven statuses had grown on the column, and two of them were the same
-- thing: a freshly onboarded rider (ACTIVE, no bike) and a deboarded rider
-- "put back on the register" (ACTIVE, no bike). Deboarding is handing a bike
-- back, not leaving; the rider stays on the register. So the status now says
-- exactly one fact, read from the open assignments, and the hidden
-- "Put back on register" step is gone (Sumukh, 2026-10-05).
--
-- RLS bypass, as every data migration here (see V015's header).
SELECT set_config('app.tenant_id', '*', true);

ALTER TABLE riders DROP CONSTRAINT IF EXISTS chk_rider_status;

UPDATE riders r
SET status = CASE
    WHEN EXISTS (SELECT 1 FROM assignments a WHERE a.rider_id = r.id AND a.ended_on IS NULL) THEN 'ACTIVE'
    ELSE 'INACTIVE'
END;

ALTER TABLE riders ADD CONSTRAINT chk_rider_status CHECK (status IN ('ACTIVE', 'INACTIVE'));
