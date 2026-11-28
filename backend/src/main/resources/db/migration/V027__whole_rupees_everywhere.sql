-- Money is whole rupees. No paise anywhere.
--
-- Amounts keep their paise columns (nothing changes shape on the wire), but
-- from here every one is a multiple of 100: the API refuses paise on a
-- payment, a cost line and spare parts paid (Money.requireWholeRupees), and
-- the day rate is whole rupees (V026). This rounds what is already stored —
-- old payments typed to the paisa against old paise balances, and week rows
-- frozen at the old per-day rate — to the nearest rupee, half away from zero,
-- so a payment and its reversal still cancel exactly.
--
-- Every BIGINT column named *_paise in the schema, so a money column added
-- later cannot be missed by a list someone forgot to update.

SELECT set_config('app.tenant_id', '*', true);

DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name LIKE '%\_paise' ESCAPE '\'
       AND data_type = 'bigint'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = round(%I / 100.0) * 100 WHERE %I %% 100 <> 0',
      col.table_name, col.column_name, col.column_name, col.column_name);
  END LOOP;
END $$;
