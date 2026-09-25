-- V003: the vehicle registry and its lifecycle log.
--
-- Stage S1 (docs/superpowers/specs/2026-09-24-s1-vehicles-design.md).
--
-- The primary key is a UUID and the human-facing registry id ("BLRSS0428") is
-- a unique column beside it. A composite (tenant_id, registry_id) key would
-- push two columns into every child table -- including the assignments table
-- S5 adds -- and would make a registry id mistyped at induction uncorrectable
-- the moment a service job pointed at it.

CREATE TABLE vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants (id),
  -- What everyone calls the bike. Unique per tenant, not globally: two
  -- operators may both run a "BLRSS0428".
  registry_id         VARCHAR(20)  NOT NULL,
  chassis_number      VARCHAR(40)  NOT NULL,
  -- Derived from the model until there is a real make list; see the spec's
  -- "Known compromises".
  make                VARCHAR(60)  NOT NULL,
  model               VARCHAR(60)  NOT NULL,
  battery_type        VARCHAR(20)  NOT NULL,
  -- Whose swap network the pack belongs to. Distinct from battery_type: the
  -- type says whether a pack comes out, the vendor says where it can be
  -- exchanged, and a breakdown needs the second one.
  battery_vendor      VARCHAR(40),
  -- Free text until hubs are modelled.
  hub                 VARCHAR(80)  NOT NULL,
  state               VARCHAR(20)  NOT NULL DEFAULT 'INDUCTED',
  registration_number VARCHAR(20),
  motor_number        VARCHAR(40),
  controller_number   VARCHAR(40),
  rfid_tag            VARCHAR(40),
  -- Telematics unit id, printed on the bike and searched by the hubs.
  iot_number          VARCHAR(40),
  odometer_km         INTEGER,
  inducted_on         DATE NOT NULL,
  purchase_date       DATE,
  created_on          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_on          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_vehicle_state CHECK (state IN (
    'INDUCTED','READY_TO_DEPLOY','DEPLOYED','RETURNED','RECOVERY',
    'UNDER_REPAIR','QC_PENDING','ACCIDENT','RETIRED')),
  CONSTRAINT chk_vehicle_odometer CHECK (odometer_km IS NULL OR odometer_km >= 0)
);

-- Both on lower(...), and both queried through an explicit lower(:value).
-- Spring Data's derived ...IgnoreCase renders UPPER(col) = UPPER(?) and would
-- miss these entirely -- the mistake S0's review found on users.email.
CREATE UNIQUE INDEX idx_vehicles_registry ON vehicles (tenant_id, lower(registry_id));
CREATE UNIQUE INDEX idx_vehicles_chassis  ON vehicles (tenant_id, lower(chassis_number));
-- The facet chips above the list count by state within a tenant.
CREATE INDEX idx_vehicles_state ON vehicles (tenant_id, state);

SELECT enable_tenant_rls('vehicles');

-- ---------------------------------------------------------------------------
-- vehicle_lifecycle_events
-- ---------------------------------------------------------------------------

-- Append-only. Never updated, never deleted: a history that can be rewritten
-- is not a history.
CREATE TABLE vehicle_lifecycle_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants (id),
  vehicle_id    UUID NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  -- NULL on induction: creating a vehicle is a transition from nothing.
  from_state    VARCHAR(20),
  to_state      VARCHAR(20) NOT NULL,
  note          TEXT,
  actor_user_id UUID REFERENCES users (id),
  -- Frozen at write time. Users get renamed; an old event must still say who
  -- it was at the time. actor_user_id is kept beside it so the person can
  -- still be found.
  actor_name    VARCHAR(120) NOT NULL,
  occurred_on   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_lifecycle_to_state CHECK (to_state IN (
    'INDUCTED','READY_TO_DEPLOY','DEPLOYED','RETURNED','RECOVERY',
    'UNDER_REPAIR','QC_PENDING','ACCIDENT','RETIRED'))
);

-- The detail screen reads one vehicle's history oldest first.
CREATE INDEX idx_lifecycle_vehicle ON vehicle_lifecycle_events (vehicle_id, occurred_on);

SELECT enable_tenant_rls('vehicle_lifecycle_events');
