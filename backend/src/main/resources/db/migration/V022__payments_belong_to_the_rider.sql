-- A payment is money from a rider, not money against one week.
--
-- Until now each payment was cut into pieces, one per unpaid week, and every
-- screen showed a different piece: ₹10,000 read as "Paid ₹500" on the run
-- because ₹9,500 had gone to older weeks. From here a payment is one row that
-- names the rider. The account (RiderAccounts) sums them; nothing is stored
-- per week any more.
--
-- Existing rows keep their period_id, so nothing about past money moves; they
-- simply learn their rider.

-- README rule 2: every table touched below carries FORCE ROW LEVEL SECURITY
-- and Flyway sets no tenant, so without this sentinel each UPDATE reports
-- "UPDATE 0" and the migration carries on as though it had worked.
SELECT set_config('app.tenant_id', '*', true);

-- V021 forgot the sentinel above, so its backfill updated nothing: charges a
-- payment had settled still read as settled by hand, and the account dropped
-- them while counting the payment that paid them. Same rule, run for real.
UPDATE rider_charges rc
   SET settled_by_payment = true
 WHERE rc.status = 'SETTLED'
   AND rc.liability = 'RIDER'
   AND rc.settled_by_payment = false
   AND EXISTS (SELECT 1 FROM payment_periods p
                WHERE p.rider_id = rc.rider_id
                  AND p.status = 'PAID'
                  AND p.period_start >= rc.period_start);

ALTER TABLE payment_collections
  ADD COLUMN rider_id          UUID REFERENCES riders (id),
  -- A reversal is its own row, the negative of the payment it names.
  ADD COLUMN reverses_id       UUID REFERENCES payment_collections (id),
  ADD COLUMN reason            VARCHAR(200),
  -- Sent by the screen once per payment form, so a double tap or a retry on a
  -- slow network saves one payment, not two.
  ADD COLUMN client_key        VARCHAR(64),
  ADD COLUMN receipt_no        VARCHAR(40),
  -- What the rider owed just before and just after, as the person taking the
  -- money saw it. The audit log and the receipt read these.
  ADD COLUMN owed_before_paise BIGINT,
  ADD COLUMN owed_after_paise  BIGINT;

UPDATE payment_collections c
   SET rider_id = p.rider_id
  FROM payment_periods p
 WHERE p.id = c.period_id;

ALTER TABLE payment_collections ALTER COLUMN rider_id SET NOT NULL;
ALTER TABLE payment_collections ALTER COLUMN period_id DROP NOT NULL;

ALTER TABLE payment_collections DROP CONSTRAINT chk_pc_amount;
ALTER TABLE payment_collections ADD CONSTRAINT chk_pc_amount CHECK (
  (reverses_id IS NULL AND amount_paise > 0)
  OR (reverses_id IS NOT NULL AND amount_paise < 0 AND reason IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_pc_rider ON payment_collections (tenant_id, rider_id, collected_on);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_client_key ON payment_collections (tenant_id, client_key)
  WHERE client_key IS NOT NULL;
-- A payment can be reversed once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_reverses ON payment_collections (reverses_id)
  WHERE reverses_id IS NOT NULL;
