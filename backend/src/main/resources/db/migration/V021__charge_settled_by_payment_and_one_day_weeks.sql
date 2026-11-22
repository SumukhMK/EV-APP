-- Whether a charge was settled by a payment taken in the run, as opposed to
-- being marked settled by hand (paid elsewhere, or drawn from the deposit).
-- A rider's account counts the first kind — the payment that covered it is
-- already in the account — and drops the second, which was never billed.
ALTER TABLE rider_charges ADD COLUMN settled_by_payment boolean NOT NULL DEFAULT false;

-- Until now the run settled a rider-liable charge when the week it fell in,
-- or a later one, was paid in full. Rows that match that rule were settled by
-- a payment; anything else settled was marked by hand.
UPDATE rider_charges rc
   SET settled_by_payment = true
 WHERE rc.status = 'SETTLED'
   AND rc.liability = 'RIDER'
   AND EXISTS (SELECT 1 FROM payment_periods p
                WHERE p.rider_id = rc.rider_id
                  AND p.status = 'PAID'
                  AND p.period_start >= rc.period_start);

-- With individual billing days the current week is billed up to today, so on
-- a rider's billing day (or their first day on a bike) the week is that one
-- day: period_end equals period_start. The old check refused it, and one such
-- rider failed the whole run for everybody.
ALTER TABLE payment_periods DROP CONSTRAINT chk_pp_window;
ALTER TABLE payment_periods ADD CONSTRAINT chk_pp_window CHECK (period_end >= period_start);
