# Service Management — Backend Design

**Date:** 2026-09-22 · **Owner:** SMK · **Status:** Approved

---

## What this is

When a bike comes back damaged, breaks down on the road, or fails a check — a
**service job** is opened. The service module tracks that job from intake to QC
release, records what was fixed, what it cost, and who pays.

This document covers: the Spring Boot module, database tables, REST API, business
rules, and who builds what.

---

## Key decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Own module or part of tenantadmin? | Own module: `com.evrental.service` | Too complex to lump in — state machine, 9 queues, QC gate, cost tracking |
| 2 | When a job opens, how does the bike's state change? | Same transaction (synchronous) | Operator is watching the screen — bike must move instantly |
| 3 | When a job closes, how does the rider get charged? | Background thread (async) | Charge only matters at next weekly payment run, days later |
| 4 | Where do we store the job's activity log? | Separate table, one row per event | Easy to add, no edit/delete, easy to query across jobs |
| 5 | How do we store the QC checklist? | JSON column, validated by backend | 9 fixed checks now. JSON shape works when we add custom checklists later |
| 6 | How does deboard/exchange (Abhiram's code) create a service job? | Calls a Java interface (`ServiceJobFacade`) | One owner per module. Abhiram never touches service code |

---

## Folder structure

```
com.evrental.service/
  ServiceJobController.java     — REST API (list, get, create, update, close)
  QcInspectionController.java   — REST API (submit QC, get QC history)
  ServiceJobService.java        — Business logic, state machine, validation
  ServiceJobFacade.java         — Interface that other modules call
  ServiceJobRepository.java     — Database access: service_jobs
  ServiceJobEventRepository.java — Database access: service_job_events
  ServiceJobItemRepository.java  — Database access: service_job_items
  QcInspectionRepository.java   — Database access: qc_inspections

  domain/
    ServiceJob.java             — Main record
    ServiceJobEvent.java        — One activity log entry
    ServiceJobItem.java         — One cost line (part, labour, other)
    QcInspection.java           — One QC attempt (JSON checklist + pass/fail)
    ServiceQueue.java           — Enum: 9 queues
    ServiceJobSource.java       — Enum: 7 ways a bike reaches service
    ServiceJobStatus.java       — Enum: OPEN, IN_PROGRESS, CLOSED
    ServiceLiability.java       — Enum: DEPOSIT, RIDER, COMPANY
    DamageCategory.java         — Enum: NONE, MINOR, MAJOR, ACCIDENT

  dto/
    CreateServiceJobRequest.java
    UpdateServiceJobRequest.java
    CloseServiceJobRequest.java
    SubmitQcRequest.java
    ServiceJobResponse.java

  event/
    ServiceJobClosedEvent.java  — Fired when a job closes → payment module listens
```

---

## Database tables

All tables have `tenant_id` for row-level security. Migration: `V003__service_management.sql`.

### service_jobs

The main record. One row per job.

```sql
CREATE TABLE service_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  vehicle_id       VARCHAR(20) NOT NULL,     -- bike id like "BLRSS0428"
  rider_id         UUID,                     -- null for walk-ins, inspections
  source           VARCHAR(20) NOT NULL,     -- how the bike got here
  damage_category  VARCHAR(10) NOT NULL,     -- how bad is it
  queue            VARCHAR(20) NOT NULL,     -- which workshop queue
  status           VARCHAR(15) NOT NULL DEFAULT 'OPEN',
  liability        VARCHAR(10),              -- who pays (null until closed)
  work_summary     TEXT NOT NULL DEFAULT '',
  damage_notes     TEXT,                     -- what the operator saw
  location         VARCHAR(100),             -- pickup spot (RSA/QRT only)
  reference        VARCHAR(100),             -- insurance or warranty claim number
  technician       VARCHAR(100),
  total_cost_paise BIGINT NOT NULL DEFAULT 0, -- frozen on close
  created_on       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_on        TIMESTAMPTZ,
  updated_on       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Rules enforced by the database:
  CONSTRAINT chk_status CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED')),
  CONSTRAINT chk_source CHECK (source IN ('DEBOARD','EXCHANGE','RSA','QRT','WALK_IN','INSPECTION','REGISTRY')),
  CONSTRAINT chk_queue CHECK (queue IN ('ASSESSMENT','MINOR_REPAIR','MAJOR_REPAIR','ACCIDENT','WARRANTY','INSURANCE','PARTS_WAITING','QC_PENDING','READY_TO_DEPLOY')),
  CONSTRAINT chk_liability CHECK (liability IS NULL OR liability IN ('DEPOSIT','RIDER','COMPANY')),
  CONSTRAINT chk_damage CHECK (damage_category IN ('NONE','MINOR','MAJOR','ACCIDENT')),
  -- Can't close a job without deciding who pays:
  CONSTRAINT chk_closed_has_liability CHECK (status != 'CLOSED' OR liability IS NOT NULL)
);

-- Fast lookups:
CREATE INDEX idx_sj_tenant_status ON service_jobs(tenant_id, status);
CREATE INDEX idx_sj_tenant_queue  ON service_jobs(tenant_id, queue);
CREATE INDEX idx_sj_vehicle       ON service_jobs(vehicle_id);

-- Only one open job per bike per tenant (database enforced):
CREATE UNIQUE INDEX idx_sj_one_active_per_vehicle
  ON service_jobs(tenant_id, vehicle_id) WHERE status != 'CLOSED';
```

**Source** = how the bike got to service:

| Value | Meaning |
|-------|---------|
| DEBOARD | Rider gave the bike back |
| EXCHANGE | Old bike came back during a swap |
| RSA | Roadside help — team went to pick it up |
| QRT | Quick response team sent out |
| WALK_IN | Rider rode in with a problem |
| INSPECTION | Routine check |
| REGISTRY | Migrated from old records |

**Queue** = which workshop queue the bike sits in:

| Queue | Bike state becomes |
|-------|-------------------|
| ASSESSMENT | UNDER_REPAIR |
| MINOR_REPAIR | UNDER_REPAIR |
| MAJOR_REPAIR | UNDER_REPAIR |
| ACCIDENT | ACCIDENT |
| WARRANTY | UNDER_REPAIR |
| INSURANCE | UNDER_REPAIR |
| PARTS_WAITING | UNDER_REPAIR |
| QC_PENDING | QC_PENDING |
| READY_TO_DEPLOY | READY_TO_DEPLOY |

### service_job_events

Activity log. **Never edited, never deleted.** One INSERT per action.

```sql
CREATE TABLE service_job_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  job_id        UUID NOT NULL REFERENCES service_jobs(id),
  queue         VARCHAR(20) NOT NULL,      -- queue at time of event
  vehicle_state VARCHAR(20) NOT NULL,      -- bike state at time of event
  actor         VARCHAR(100) NOT NULL,     -- who did it
  note          TEXT NOT NULL DEFAULT '',   -- what happened
  occurred_on   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sje_job   ON service_job_events(job_id);
CREATE INDEX idx_sje_actor ON service_job_events(tenant_id, actor, occurred_on);
```

### service_job_items

Cost breakdown. Parts, labour, other charges.

```sql
CREATE TABLE service_job_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  job_id     UUID NOT NULL REFERENCES service_jobs(id),
  label      VARCHAR(200) NOT NULL,        -- "Left panel" or "Labour — 2hr"
  cost_paise BIGINT NOT NULL,              -- money in paise (integer, never float)
  kind       VARCHAR(10) NOT NULL DEFAULT 'OTHER',

  CONSTRAINT chk_item_kind     CHECK (kind IN ('PART','LABOUR','OTHER')),
  CONSTRAINT chk_cost_positive CHECK (cost_paise >= 0)
);

CREATE INDEX idx_sji_job ON service_job_items(job_id);
```

### qc_inspections

QC gate. A bike can't go back to the fleet without passing QC.

```sql
CREATE TABLE qc_inspections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  job_id       UUID NOT NULL REFERENCES service_jobs(id),
  vehicle_id   VARCHAR(20) NOT NULL,
  checks       JSONB NOT NULL,              -- {"brakes":true,"tyres":true,...}
  passed       BOOLEAN NOT NULL,            -- true only if ALL checks are true
  inspector    VARCHAR(100) NOT NULL,
  notes        TEXT,
  inspected_on TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_checks_not_empty CHECK (checks != '{}'::jsonb)
);

CREATE INDEX idx_qci_job     ON qc_inspections(job_id);
CREATE INDEX idx_qci_vehicle ON qc_inspections(vehicle_id);
```

**Required QC checks:** brakes, tyres, battery, lights, horn, mirrors, throttle, frame, road_test. All 9 must be present. All must be `true` for the bike to pass. A bike can be QC'd multiple times (fail → repair → QC again).

### Row-level security (all 4 tables)

```sql
ALTER TABLE service_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_jobs
  USING (tenant_id::text = current_setting('app.tenant_id', true));
-- Same for the other 3 tables.
```

### How tables connect

```
service_jobs  ──has many──  service_job_events  (activity log)
service_jobs  ──has many──  service_job_items   (cost lines)
service_jobs  ──has many──  qc_inspections      (QC attempts)
service_jobs  ──belongs to── vehicles           (by vehicle_id)
service_jobs  ──belongs to── riders             (by rider_id, can be null)
```

---

## REST API

Base: `/api/v1/service`. All need a JWT token. Tenant comes from the token.

### Service jobs

| Method | URL | What it does | Who can call |
|--------|-----|-------------|-------------|
| GET | `/jobs` | List jobs. Filter by `status`, `queue`, `source`, `vehicleId`. Paginated. | Everyone |
| GET | `/jobs/{id}` | Get one job with its events, items, and QC history | Everyone |
| POST | `/jobs` | Open a new job | Staff and above |
| PUT | `/jobs/{id}` | Update a job (change queue, add items, add notes) | Staff and above |
| POST | `/jobs/{id}/close` | Close a job (set liability, freeze costs) | Staff and above, **not** Service Manager |

### QC

| Method | URL | What it does | Who can call |
|--------|-----|-------------|-------------|
| POST | `/jobs/{id}/qc` | Submit a QC inspection | Staff and above |
| GET | `/jobs/{id}/qc` | Get QC history for a job | Everyone |

### Dashboard

| Method | URL | What it does | Who can call |
|--------|-----|-------------|-------------|
| GET | `/queues/counts` | Count of open jobs per queue | Everyone |

### What the requests look like

**Open a job:**
```json
{
  "vehicleId": "BLRSS0428",
  "riderId": "some-uuid-or-null",
  "source": "DEBOARD",
  "damageCategory": "MINOR",
  "damageNotes": "Scratched left panel, brake lever bent",
  "queue": "MINOR_REPAIR"
}
```

**Update a job:**
```json
{
  "queue": "MAJOR_REPAIR",
  "damageCategory": "MAJOR",
  "workSummary": "Panel replaced, brake lever replaced",
  "items": [
    {"label": "Left panel", "costPaise": 85000, "kind": "PART"},
    {"label": "Labour — 2hr", "costPaise": 60000, "kind": "LABOUR"}
  ],
  "technician": "Raju",
  "note": "Upgraded from minor — cracked panel behind scratch"
}
```

**Close a job:**
```json
{
  "items": [
    {"label": "Left panel", "costPaise": 85000, "kind": "PART"},
    {"label": "Labour — 2hr", "costPaise": 60000, "kind": "LABOUR"}
  ],
  "liability": "RIDER",
  "technician": "Raju",
  "note": "Rider confirmed damage on return"
}
```

**Submit QC:**
```json
{
  "checks": {
    "brakes": true, "tyres": true, "battery": true,
    "lights": true, "horn": true, "mirrors": true,
    "throttle": true, "frame": true, "road_test": true
  },
  "inspector": "Suresh",
  "notes": "All clear"
}
```

### The facade (internal Java call, not REST)

Other modules call this to open a job without knowing service internals:

```java
public interface ServiceJobFacade {
    ServiceJob openJob(
        UUID tenantId, String vehicleId, UUID riderId,
        ServiceJobSource source, DamageCategory damage,
        String damageNotes, String actor
    );
}
```

Abhiram's deboard/exchange code injects this interface and calls `openJob()`. SMK owns the implementation.

---

## Business rules

### How damage decides the queue

| Damage | Goes to queue | Bike becomes |
|--------|--------------|-------------|
| None | QC_PENDING | QC_PENDING |
| Minor | MINOR_REPAIR | UNDER_REPAIR |
| Major | MAJOR_REPAIR | UNDER_REPAIR |
| Accident | ACCIDENT | ACCIDENT |

### What happens at each step

**Opening a job:**
1. Bike must exist and belong to this tenant
2. Bike can't already have an open job (database enforces this)
3. Bike state must be DEPLOYED, INDUCTED, or RECOVERY (not already in repair)
4. Bike state changes immediately (same transaction)
5. First event is logged

**Updating a job:**
1. Job must not be closed
2. If queue changes, bike state changes to match
3. Status moves to IN_PROGRESS
4. Cost total is recalculated from items
5. Event is logged

**Closing a job:**
1. Must pick who pays (RIDER, DEPOSIT, or COMPANY)
2. Cost is frozen — never recalculated after close
3. If rider or deposit pays → a charge is created in the background
4. If company pays → no charge
5. Final event is logged

**QC inspection:**
1. All 9 checks must be present
2. All true → bike goes to READY_TO_DEPLOY (back in the fleet)
3. Any false → bike goes back to UNDER_REPAIR for rework
4. Multiple attempts allowed (fail → fix → QC again)
5. Event logged either way

### How modules talk to each other

| From | To | How | When |
|------|----|-----|------|
| Service | Vehicle | Direct call, same transaction | Job opens/closes, QC pass/fail |
| Service | Payment | Background event | Job closes with rider/deposit liability |
| Assignment | Service | Facade interface | Deboard or exchange creates a job |

### Concurrency

Two people deboard the same bike at the same time? First one wins. Second gets a 409 error ("This bike already has an open service job"). The database's partial unique index enforces this.

---

## How modules talk to each other

```
Service opens a job
  → changes bike state (instant, same transaction)

Service closes a job
  → fires ServiceJobClosedEvent (background)
  → payment module hears it
  → creates a RiderCharge if rider or deposit pays

Abhiram's deboard endpoint
  → validates the return
  → calls ServiceJobFacade.openJob()
  → job created, bike state changed, all in one transaction
```

---

## Build order

What blocks what:

```
S0: Spring Boot + auth + database setup (SMK)
 ├── S1: Vehicles (SMK)       ║  S2: Riders (Abhiram)   ← parallel
 │                             ║  S3: Users/RBAC (SMK)
 └── S4: Service (SMK)        ← needs S1 + S2
      ├── S5: Assignments (Abhiram) ← needs S4 facade
      └── S6: Payments (SMK)       ← needs S4 events
```

| Stage | What | Who | Needs | Done when |
|-------|------|-----|-------|-----------|
| S0 | Boot app, JWT login, tenant filter, row-level security, database setup, Docker, CI | SMK | Nothing | Login works, RLS proven with 2 tenants |
| S1 | Bike CRUD, state machine, lifecycle log, CSV upload | SMK | S0 | Can create bike, transition states, invalid transition = 409 |
| S2 | Rider CRUD, KYC, Aadhaar masking | Abhiram | S0 | Can create rider with masked Aadhaar |
| S3 | User CRUD, roles, block wrong roles from wrong endpoints | SMK | S0 | Staff can't see payments, service manager can't close jobs |
| S4 | Service module (this doc) | SMK | S0, S1, S2 | All 17 tests pass (see below) |
| S5 | Assign bike to rider, exchange, deboard — deboard calls facade | Abhiram | S0–S4 | Deboard with minor damage → service job created |
| S6 | Rider charges, weekly payment run, receipts, overdue, dunning | SMK | S0, S2, S4 | Close job as rider-pays → charge shows in payment run |

### Timeline

```
Week 1–2:  SMK builds S0
Week 2–3:  SMK builds S1  ║  Abhiram builds S2  (parallel)
Week 3:    SMK builds S3
Week 3–5:  SMK builds S4  ║  Abhiram starts S5 shell
Week 5–6:  Abhiram wires S5 to facade  ║  SMK builds S6
Week 6:    Integration test, swap frontend mocks for real API
```

### Tests for S4 (service module)

| # | Test | Expected |
|---|------|----------|
| 1 | Open job, no damage | Queue = QC_PENDING, bike = QC_PENDING |
| 2 | Open job, minor damage | Queue = MINOR_REPAIR, bike = UNDER_REPAIR |
| 3 | Open job, accident | Queue = ACCIDENT, bike = ACCIDENT |
| 4 | Open second job for same bike | 409 error |
| 5 | Change queue | Queue updated, event logged |
| 6 | Move to QC queue | Bike = QC_PENDING |
| 7 | Close with liability | Status = CLOSED, cost frozen |
| 8 | Close without liability | 400 error |
| 9 | Close, rider pays | Charge created in background |
| 10 | Close, company pays | No charge created |
| 11 | QC pass (all checks true) | Bike = READY_TO_DEPLOY |
| 12 | QC fail (one check false) | Bike = UNDER_REPAIR |
| 13 | QC with missing check | 400 error |
| 14 | QC fail then pass | Two QC rows, bike ends at READY_TO_DEPLOY |
| 15 | Tenant isolation | Tenant B can't see Tenant A's jobs |
| 16 | Service manager tries to close | 403 error |
| 17 | Queue counts | Returns correct count per queue |

---

## Frontend swap

When each backend stage is done, one file changes in the frontend. No screens change — only the data source.

| Backend done | Frontend file changes | What gets removed |
|-------------|----------------------|-------------------|
| S1 | `lib/api/vehicles.ts` | mock import → real fetch |
| S2 | `lib/api/riders.ts` | mock import → real fetch |
| S3 | `lib/api/users.ts` | mock import → real fetch |
| S4 | `lib/api/serviceJobs.ts` | mock import → real fetch |
| S5 | `lib/api/assignments.ts` | mock import → real fetch |
| S6 | `lib/api/payments.ts` | mock import → real fetch |

`client.ts` already has `API_BASE = '/api/v1'`. One swap point, no screen rewrites.
