-- V008: the rider register (S2) — docs/superpowers/plans/2026-09-25-s2-riders.md.
--
-- The register holds exactly what the frontend contract (types/rider.ts)
-- exposes and nothing else: identity/contact/address fields captured at the
-- counter are not persisted (matching the mock). The one exception is the
-- Aadhaar: it is stored, but encrypted at rest (AES-256-GCM, key from the
-- AADHAAR_ENCRYPTION_KEY environment variable) and never returned by the API.
--
-- currentVehicleId is deliberately absent. A rider's bike is a property of
-- the open assignment, which S5 owns; storing it here too would be two copies
-- of one fact, the same reasoning Vehicle.java applies to currentRiderId.
--
-- paymentStatus is absent too. It is derived from the current billing period
-- (S6's second half); the register answers "PENDING" until then.

CREATE TABLE riders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  name                 VARCHAR(120) NOT NULL,
  -- Unique per tenant, not globally: two operators may both have a
  -- "9876543210" on their register.
  phone                VARCHAR(20)  NOT NULL,
  status               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  kyc_status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  -- Weekly rent and the deposit held, in paise. The wire already carries
  -- paise (the onboard form converts rupees at the edge), so no conversion
  -- happens here.
  plan_amount_paise    BIGINT       NOT NULL DEFAULT 0,
  deposit_held_paise   BIGINT       NOT NULL DEFAULT 0,
  -- Which of Ashok's two billing cycles this rider is on. Drives the S6 runs.
  billing_day          VARCHAR(10)  NOT NULL,
  -- The day this rider says they pay. Captured, not acted on — see the
  -- PaymentDay doc in types/rider.ts.
  payment_day          VARCHAR(10)  NOT NULL,
  -- The standing arrangement, not a receipt. Same three values a collection
  -- can be recorded in (types/payment.ts PaymentMethod).
  payment_mode         VARCHAR(20)  NOT NULL,
  -- Free text until platforms are modelled; the form only requires a value.
  platform             VARCHAR(40)  NOT NULL,
  onboarded_on         DATE         NOT NULL,
  -- The four OTP round-trips from the onboard form, kept for audit. They do
  -- not drive kyc_status: a rider joins PENDING and nothing changes it yet.
  aadhaar_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  primary_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  whatsapp_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
  alternate1_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  -- The Aadhaar, encrypted at rest by AadhaarCipher (AES-256-GCM, a fresh
  -- random IV per value, key from the AADHAAR_ENCRYPTION_KEY environment
  -- variable — never in the database, never on the wire). Stored form:
  -- v1:<base64(iv)>:<base64(ciphertext||tag)>. The API never returns it;
  -- nothing reads it back until a KYC verification step needs to.
  aadhaar_encrypted    TEXT         NOT NULL,
  created_on           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_on           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_rider_status CHECK (status IN (
    'ONBOARDING','ACTIVE','SUSPENDED','DEBOARDED','OFFBOARDED','BLACKLISTED','INACTIVE')),
  CONSTRAINT chk_rider_kyc_status CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
  CONSTRAINT chk_rider_billing_day CHECK (billing_day IN ('MONDAY','WEDNESDAY')),
  CONSTRAINT chk_rider_payment_day CHECK (payment_day IN (
    'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')),
  CONSTRAINT chk_rider_payment_mode CHECK (payment_mode IN ('UPI','CASH','BANK_TRANSFER')),
  CONSTRAINT chk_rider_money CHECK (plan_amount_paise >= 0 AND deposit_held_paise >= 0)
);

-- Phones are digits, so the uniqueness is exact — no lower() index needed.
CREATE UNIQUE INDEX idx_riders_phone ON riders (tenant_id, phone);
-- The facet chips above the list count by status within a tenant.
CREATE INDEX idx_riders_status ON riders (tenant_id, status);

SELECT enable_tenant_rls('riders');

-- ---------------------------------------------------------------------------
-- The FKs V006 and V007 deliberately left off
-- ---------------------------------------------------------------------------

-- V006: "No foreign key yet — riders are S2 and are not built."
-- V007: "the ledger can be written correctly today and joined to a real rider
-- the day S2 lands." That day is now: a job or a charge that names a rider
-- names a real one. No ON DELETE clause — riders are never deleted, and a
-- job or charge pointing at a removed rider is a mistake worth failing on.
ALTER TABLE service_jobs
  ADD CONSTRAINT fk_service_jobs_rider FOREIGN KEY (rider_id) REFERENCES riders (id);

ALTER TABLE rider_charges
  ADD CONSTRAINT fk_rider_charges_rider FOREIGN KEY (rider_id) REFERENCES riders (id);