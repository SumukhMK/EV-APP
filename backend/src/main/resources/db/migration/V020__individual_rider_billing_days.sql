-- Each rider now selects an arbitrary weekday as their recurring due day.
-- Old Monday/Wednesday values remain valid; the other five become available.

ALTER TABLE riders DROP CONSTRAINT IF EXISTS chk_rider_billing_day;
ALTER TABLE riders ADD CONSTRAINT chk_rider_billing_day
    CHECK (billing_day IN ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'));

ALTER TABLE payment_periods DROP CONSTRAINT IF EXISTS chk_pp_billing_day;
ALTER TABLE payment_periods ADD CONSTRAINT chk_pp_billing_day
    CHECK (billing_day IN ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'));
ALTER TABLE payment_periods DROP CONSTRAINT IF EXISTS chk_pp_days;
ALTER TABLE payment_periods ADD CONSTRAINT chk_pp_days CHECK (days_billed BETWEEN 0 AND 14);

DROP INDEX IF EXISTS idx_pp_run;
CREATE INDEX idx_pp_run ON payment_periods (tenant_id, period_end, status);

-- A charge is assigned to the period that contains its charge date. The
-- period window is rider-specific, so anchor it on the rider's weekday.
UPDATE rider_charges rc
   SET period_start = (rc.charged_on AT TIME ZONE 'Asia/Kolkata')::date
       - ((EXTRACT(ISODOW FROM rc.charged_on AT TIME ZONE 'Asia/Kolkata')::int
           - CASE r.billing_day
               WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3
               WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 ELSE 7 END
           + 7) % 7)
       + 1
  FROM riders r
 WHERE r.id = rc.rider_id;
