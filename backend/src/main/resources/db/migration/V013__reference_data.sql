-- V013: hubs and models become data.
--
-- Both were hardcoded in the frontend — five models and four hubs living in
-- mocks/seed.ts and imported straight into the add-vehicle, edit-vehicle and
-- assistance-job forms. An operator whose hubs are not Bengaluru, HSR Layout,
-- Koramangala or Whitefield could not add a bike at all, and the lists said
-- nothing about the fleet actually in the database.
--
-- Seeded from what is already there rather than from the fixture, so an
-- operator's own values survive the migration and a tenant that was never a
-- demo does not inherit demo hubs.

CREATE TABLE hubs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  name       VARCHAR(80) NOT NULL,
  -- Retiring a hub must not rewrite the bikes that sat in it, so it is a flag
  -- rather than a delete. vehicles.hub stays free text for that reason too:
  -- this table is the list offered, not a foreign key.
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_on TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_hubs_name ON hubs (tenant_id, lower(name));
SELECT enable_tenant_rls('hubs');

CREATE TABLE vehicle_models (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  name       VARCHAR(60) NOT NULL,
  -- Derived from the model name today by a rule both sides apply. Stored so a
  -- model whose make does not follow the rule can say so.
  make       VARCHAR(60) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_on TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_vehicle_models_name ON vehicle_models (tenant_id, lower(name));
SELECT enable_tenant_rls('vehicle_models');

-- README rule 2: these read and write across tenants, so the bypass is set.
SELECT set_config('app.tenant_id', '*', true);

INSERT INTO hubs (tenant_id, name)
SELECT DISTINCT v.tenant_id, v.hub
  FROM vehicles v
 WHERE v.hub IS NOT NULL AND btrim(v.hub) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO vehicle_models (tenant_id, name, make)
SELECT DISTINCT v.tenant_id, v.model, v.make
  FROM vehicles v
 WHERE v.model IS NOT NULL AND btrim(v.model) <> ''
ON CONFLICT DO NOTHING;
