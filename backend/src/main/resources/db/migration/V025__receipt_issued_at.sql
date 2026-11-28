-- When a payment's receipt was first printed.
--
-- Once the rider holds a printed receipt, fleet staff can no longer reverse
-- that payment on their own; an admin has to (ReversalPolicy). Null until the
-- first print; a reprint does not move it. Existing payments stay null: there
-- is no record of which old receipts were printed.

SELECT set_config('app.tenant_id', '*', true);

ALTER TABLE payment_collections ADD COLUMN IF NOT EXISTS receipt_issued_at TIMESTAMPTZ;
