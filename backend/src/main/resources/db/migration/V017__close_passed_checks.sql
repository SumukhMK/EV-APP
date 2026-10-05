-- V017: close the clean first checks that passed QC before checks closed
-- themselves.
--
-- Until today a passed inspection stayed open: closing a job is a money
-- decision, and nobody made one for a check that found nothing and cost
-- nothing. The open row then blocked the bike's next return ("already has
-- an open service job") — the chain new bike → first check → assign →
-- exchange failed on every bike checked so far. ServiceJobService now closes
-- such a check on the QC pass; this closes the ones already sitting there,
-- with the same liability and a note in the activity log, so the fix is
-- not "from now on" but "for every bike".
--
-- Only the exact shape the service closes: no damage reported, nothing
-- billed, QC passed (queue READY_TO_DEPLOY), still open. A repair that
-- passed QC keeps waiting for the fleet to say who pays.
--
-- RLS bypass, as every data migration here (see V015's header).
SELECT set_config('app.tenant_id', '*', true);

WITH closed AS (
  UPDATE service_jobs
  SET status = 'CLOSED',
      liability = 'COMPANY',
      closed_on = now(),
      updated_on = now()
  WHERE status <> 'CLOSED'
    AND damage_category = 'NONE'
    AND queue = 'READY_TO_DEPLOY'
    AND total_cost_paise = 0
  RETURNING id, tenant_id, queue
)
INSERT INTO service_job_events (tenant_id, job_id, queue, vehicle_state, actor, note)
SELECT tenant_id, id, queue, 'READY_TO_DEPLOY', 'System',
       'Check passed earlier with nothing to bill — closed by the V017 migration so the bike can come back'
FROM closed;
