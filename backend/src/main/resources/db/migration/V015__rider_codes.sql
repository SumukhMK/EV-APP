-- V015: friendly, searchable rider ids ("R01", "R02"...), one per tenant.
--
-- The rider register's primary key is a UUID, and until now that UUID was
-- also what every screen showed and every URL carried — the mock's own rider
-- fixtures are "R01"/"R02" (see frontend/app/src/mocks/riders.ts and
-- lib/shortId.ts's comment), so the live build had quietly drifted from the
-- design it was built against. Vehicles never had this problem: registry_id
-- was always the human-facing column beside the UUID primary key. This
-- migration gives riders the same split.
--
-- rider_code_counters is the same row-lock pattern as receipt_counters
-- (V010): a Postgres sequence keeps its value when a transaction rolls back,
-- so two riders onboarded back to back could leave a hole in the numbering
-- if an onboard failed after taking a number. The UPDATE ... RETURNING in
-- RiderCodes.next() holds the row for the rest of the onboarding transaction,
-- so a rollback puts the number back.

CREATE TABLE IF NOT EXISTS rider_code_counters (
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  next_no   BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id)
);

SELECT enable_tenant_rls('rider_code_counters');

ALTER TABLE riders ADD COLUMN IF NOT EXISTS rider_code VARCHAR(10);

-- Backfill: every existing rider gets the next code in their tenant, assigned
-- oldest-onboarded-first so a tenant's longest-standing riders keep the
-- lowest numbers. created_on/id break a tie on the same onboarding date.
WITH ordered AS (
  SELECT id, tenant_id,
         row_number() OVER (
           PARTITION BY tenant_id ORDER BY onboarded_on, created_on, id
         ) AS rn
  FROM riders
)
-- Two digits below 100 and the plain number above, exactly as RiderCodes.next()
-- formats new ones. Not lpad alone: Postgres lpad TRUNCATES to the given
-- length, so the 100th rider would have become "R10" and collided with the
-- tenth when the unique index below was built.
UPDATE riders r
SET rider_code = 'R' || CASE WHEN ordered.rn < 100
                             THEN lpad(ordered.rn::text, 2, '0')
                             ELSE ordered.rn::text END
FROM ordered
WHERE r.id = ordered.id;

-- The counter starts after the highest code just assigned, so the next
-- onboard in a tenant continues the sequence rather than colliding with it.
INSERT INTO rider_code_counters (tenant_id, next_no)
SELECT tenant_id, count(*) + 1
FROM riders
GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE SET next_no = excluded.next_no;

ALTER TABLE riders ALTER COLUMN rider_code SET NOT NULL;

-- Both on lower(...), and both queried through an explicit lower(:value),
-- the same reasoning idx_vehicles_registry documents: Spring Data's derived
-- ...IgnoreCase renders UPPER(col) = UPPER(?), which cannot use this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_riders_code ON riders (tenant_id, lower(rider_code));
