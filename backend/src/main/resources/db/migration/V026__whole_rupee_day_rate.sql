-- A day of rent is a seventh of the weekly plan, to the nearest whole rupee.
--
-- It was a seventh to the paisa (₹2,199 → ₹314.14), and the screens rounded
-- it for display, so the rate a rider was shown and the rate they were charged
-- differed. RiderAccounts.perDay is now whole rupees (₹2,199 → ₹314) and every
-- writer calls it.
--
-- Week rows are frozen once written, and paid ones stay exactly as they were:
-- the money taken against them matched what they said. Unpaid part weeks
-- (1–6 days) are re-priced at the new rate so the open balances use the same
-- figure the screen shows. Full weeks bill the plan and do not change.

SELECT set_config('app.tenant_id', '*', true);

UPDATE payment_periods p
   SET per_day_amount_paise = n.per_day,
       billed_amount_paise  = n.per_day * p.days_billed,
       total_due_paise      = p.total_due_paise - p.billed_amount_paise + n.per_day * p.days_billed,
       updated_on           = now()
  FROM (SELECT id, round(plan_amount_paise / 700.0) * 100 AS per_day FROM payment_periods) n
 WHERE p.id = n.id
   AND p.status <> 'PAID'
   AND p.days_billed BETWEEN 1 AND 6
   AND p.per_day_amount_paise <> n.per_day;

-- Rows not touched above still record the old rate for the record, but a full
-- week never used it; align the column so the rate reads the same everywhere.
UPDATE payment_periods p
   SET per_day_amount_paise = round(plan_amount_paise / 700.0) * 100
 WHERE p.days_billed IN (0, 7)
   AND p.per_day_amount_paise <> round(plan_amount_paise / 700.0) * 100;
