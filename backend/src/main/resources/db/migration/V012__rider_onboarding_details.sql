-- V012: the twelve onboarding answers the register was throwing away.
--
-- OnboardRiderRequest validates five steps of the wizard. RiderService wrote
-- eight of them to the table and dropped the rest on the floor — its own
-- javadoc said "Validated, never stored" and meant it. So an operator typed a
-- rider's address, PIN, PAN, licence and the deposit they actually handed
-- over, the form accepted all of it, and reopening the rider showed none of
-- it. Three of the five steps had no record at all.
--
-- Two of these matter more than the rest. whatsapp_number and
-- alternate_number_1 are how a rider is reached when the primary number stops
-- answering, which is exactly the situation the overdue list exists for, and
-- the register was asking for both and keeping neither.
--
-- All nullable: every rider already on the register was onboarded without
-- them, and a NOT NULL here would need a value invented for each one.
-- Required-ness is the form's job, and the form already enforces it.

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS permanent_address    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS whatsapp_number      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS alternate_number_1   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS local_address        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS city                 VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state_name           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pin_code             VARCHAR(6),
  ADD COLUMN IF NOT EXISTS location_coordinates VARCHAR(100),
  -- Not encrypted, unlike aadhaar_encrypted. That column exists because the
  -- Aadhaar Act makes storing the number in the clear a legal problem; a PAN
  -- and a licence number are ordinary identifiers that operators read off a
  -- document and type into a search box. If that judgement is wrong it is a
  -- migration and an AadhaarCipher call, not a redesign.
  ADD COLUMN IF NOT EXISTS pan_number           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS driving_licence      VARCHAR(40),
  -- The rider's id on Zomato, Swiggy and so on — how the operator reconciles
  -- a rider with the platform they ride for.
  ADD COLUMN IF NOT EXISTS platform_rider_id    VARCHAR(60),
  -- What they actually handed over, against deposit_held_paise, which is the
  -- plan. The two differ while a rider pays a deposit in instalments, and the
  -- difference is money owed that nothing was recording.
  ADD COLUMN IF NOT EXISTS deposit_paid_paise   BIGINT;

-- "state" is a reserved-enough word in a table that already has "status" for
-- a different thing; state_name keeps the two from being read as a pair.
COMMENT ON COLUMN riders.state_name IS 'The state in the local address, not a lifecycle state.';

-- The register searches riders by phone. An alternate number is a phone an
-- operator will try, so it is worth the same index.
CREATE INDEX IF NOT EXISTS idx_riders_alternate ON riders (tenant_id, alternate_number_1);
