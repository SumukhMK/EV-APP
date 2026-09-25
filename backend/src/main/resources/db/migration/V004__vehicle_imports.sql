-- V004: staged CSV import.
--
-- Two calls -- preview, then commit -- with the parsed batch held here in
-- between. A stateless version would re-parse on commit with nothing tying the
-- two together, so what was previewed and what was imported could differ.

CREATE TABLE vehicle_imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants (id),
  file_name    VARCHAR(255) NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users (id),
  uploaded_on  TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_on TIMESTAMPTZ,
  status       VARCHAR(12) NOT NULL DEFAULT 'PENDING',

  CONSTRAINT chk_import_status CHECK (status IN ('PENDING','COMMITTED','EXPIRED'))
);

CREATE INDEX idx_imports_pending ON vehicle_imports (uploaded_on) WHERE status = 'PENDING';

SELECT enable_tenant_rls('vehicle_imports');

CREATE TABLE vehicle_import_rows (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  import_id  UUID NOT NULL REFERENCES vehicle_imports (id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  -- The parsed row, as sent. JSONB rather than one column per field so a
  -- change to the CSV columns is not a migration.
  payload    JSONB NOT NULL,
  -- NULL means the row will import cleanly.
  error      TEXT,

  CONSTRAINT uq_import_row UNIQUE (import_id, row_number)
);

CREATE INDEX idx_import_rows_import ON vehicle_import_rows (import_id, row_number);

SELECT enable_tenant_rls('vehicle_import_rows');
