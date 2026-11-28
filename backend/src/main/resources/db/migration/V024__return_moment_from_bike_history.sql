-- Older returns get the real moment the bike came back, not the end of the day.
--
-- V023 stamped every return recorded before closed_at existed at the end of its
-- return day (IST). That misplaces anything raised later the same day: a repair
-- opened at 19:05 on the bike returned at 19:02 sat before the stamp, so the
-- rider's account dropped it — and the money they paid against it then showed
-- as credit.
--
-- The bike's own history has the moment: recording a return moves the bike out
-- of DEPLOYED, written in the same transaction. Take the last such move on the
-- return day, before the bike went out to anyone else. Rows with no matching
-- event keep V023's end-of-day stamp; rows stamped by the app are not touched.

SELECT set_config('app.tenant_id', '*', true);

UPDATE assignments a
   SET closed_at = moment.occurred_on
  FROM (
        SELECT a2.id,
               (SELECT max(e.occurred_on)
                  FROM vehicle_lifecycle_events e
                 WHERE e.vehicle_id = a2.vehicle_id
                   AND e.from_state = 'DEPLOYED'
                   AND (e.occurred_on AT TIME ZONE 'Asia/Kolkata')::date = a2.ended_on
                   AND e.occurred_on < COALESCE(
                         (SELECT min(b.created_on)
                            FROM assignments b
                           WHERE b.vehicle_id = a2.vehicle_id
                             AND b.created_on > a2.created_on),
                         'infinity'::timestamptz)) AS occurred_on
          FROM assignments a2
         WHERE a2.ended_on IS NOT NULL
           AND a2.closed_at = ((a2.ended_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       ) moment
 WHERE a.id = moment.id
   AND moment.occurred_on IS NOT NULL;
