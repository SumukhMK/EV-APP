-- When a return was recorded, to the second.
--
-- A rider with no bike owes what the return form said they still owed plus
-- anything raised since, less what they paid since. "Since" has to be the
-- moment the return was recorded, not its date: a rider who pays at 12:20
-- and hands the bike back at 12:50 has already paid that money into the
-- figure on the return form, and counting it again showed them in credit.
--
-- Rows closed before this column existed are stamped at the end of their
-- return day (IST). Money taken on a return day was taken at the counter
-- while the bike came back, so it belongs to the tenancy it ended.

SELECT set_config('app.tenant_id', '*', true);

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE assignments
   SET closed_at = ((ended_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
 WHERE ended_on IS NOT NULL
   AND closed_at IS NULL;
