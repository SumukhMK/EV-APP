# Service Management — Backend Architecture & Work Split

**Date:** 2026-09-22
**Author:** SMK
**Status:** Approved
**Branch:** feature/service-management

---

## 1. Overview

Service management is the most complex domain in the EV rental platform — a state
machine with 9 queues, 7 job sources, 4 damage categories, 3 liability types, and
a QC gate that is the sole path back to the deployable pool. This document designs
the backend module (`com.evrental.service`), its database schema, REST API, business
rules, and the work split between SMK and Abhiram.

### Decisions locked in this spec

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Module extraction | Own module `com.evrental.service`, not lumped in `tenantadmin` | Complexity warrants isolation: state machine, queue routing, QC, cost tracking, liability |
| D2 | Cross-module vehicle state | Synchronous — same transaction | Vehicle state is a hard real-time constraint (operator staring at queue screen) |
| D3 | Cross-module rider charge | Asynchronous — Spring `@Async` event | Charge only matters at next payment run (days later). Phase 2 moves to RabbitMQ |
| D4 | Activity log storage | Separate `service_job_events` table, append-only | Matches BUILD.md "append-only" rule. No concurrent-write contention. Enables cross-job queries (technician performance, queue throughput) |
| D5 | QC checklist storage | JSONB column on `qc_inspections`, backend-validated | 9 fixed items in Phase 1. JSONB shape unchanged when Phase 2 adds tenant-configurable checklists — only the validation set changes |
| D6 | Cross-module facade | `ServiceJobFacade` interface — Abhiram injects it from assignment endpoints | One owner per module. Abhiram codes against the interface; SMK owns the implementation |

---

## 2. Module Boundaries & Package Structure

```
com.evrental.service
├── ServiceJobController        // REST endpoints (5: list, get, create, close, update)
├── QcInspectionController      // REST endpoints (2: submit QC, get QC for job)
├── ServiceJobService           // Business logic: state machine, queue routing, validation
├── ServiceJobFacade            // Internal API for other modules (assignments calls this)
├── ServiceJobRepository        // JPA: service_jobs table
├── ServiceJobEventRepository   // JPA: service_job_events table (append-only)
├── QcInspectionRepository      // JPA: qc_inspections table
├── ServiceJobItemRepository    // JPA: service_job_items table (parts/labour line items)
├── domain/
│   ├── ServiceJob.java         // Entity
│   ├── ServiceJobEvent.java    // Entity (append-only)
│   ├── ServiceJobItem.java     // Entity (cost line items)
│   ├── QcInspection.java       // Entity (JSONB checks)
│   ├── ServiceQueue.java       // Enum (9 values)
│   ├── ServiceJobSource.java   // Enum (7 values)
│   ├── ServiceJobStatus.java   // Enum (OPEN, IN_PROGRESS, CLOSED)
│   ├── ServiceLiability.java   // Enum (DEPOSIT, RIDER, COMPANY)
│   └── DamageCategory.java     // Enum (NONE, MINOR, MAJOR, ACCIDENT)
├── dto/
│   ├── CreateServiceJobRequest.java
│   ├── UpdateServiceJobRequest.java
│   ├── CloseServiceJobRequest.java
│   ├── SubmitQcRequest.java
│   └── ServiceJobResponse.java
└── event/
    └── ServiceJobClosedEvent.java  // Spring ApplicationEvent → async charge creation
```

### Integration seams

| Direction | Mechanism | What happens |
|-----------|-----------|-------------|
| Service → Vehicle | Sync call: `VehicleService.transitionState(vehicleId, newState)` | Job open/close/QC pass changes vehicle state in same transaction |
| Service → Payment | Async event: `ServiceJobClosedEvent` → `PaymentService.createRiderCharge()` | Rider charge created on `@Async` thread, not blocking the close |
| Assignment → Service | Facade: `ServiceJobFacade.openJob(vehicleId, riderId, source, damage)` | Deboard/exchange creates a service job without touching service internals |

---

## 3. Database Schema

Four tables, all carrying `tenant_id` for RLS. Flyway migration `V003__service_management.sql`.

### `service_jobs`

```sql
CREATE TABLE service_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    vehicle_id      VARCHAR(20) NOT NULL,
    rider_id        UUID,
    source          VARCHAR(20) NOT NULL,
    damage_category VARCHAR(10) NOT NULL,
    queue           VARCHAR(20) NOT NULL,
    status          VARCHAR(15) NOT NULL DEFAULT 'OPEN',
    liability       VARCHAR(10),
    work_summary    TEXT NOT NULL DEFAULT '',
    damage_notes    TEXT,
    location        VARCHAR(100),
    reference       VARCHAR(100),
    technician      VARCHAR(100),
    total_cost_paise BIGINT NOT NULL DEFAULT 0,
    created_on      TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_on       TIMESTAMPTZ,
    updated_on      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_status CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED')),
    CONSTRAINT chk_source CHECK (source IN ('DEBOARD','EXCHANGE','RSA','QRT','WALK_IN','INSPECTION','REGISTRY')),
    CONSTRAINT chk_queue CHECK (queue IN ('ASSESSMENT','MINOR_REPAIR','MAJOR_REPAIR','ACCIDENT','WARRANTY','INSURANCE','PARTS_WAITING','QC_PENDING','READY_TO_DEPLOY')),
    CONSTRAINT chk_liability CHECK (liability IS NULL OR liability IN ('DEPOSIT','RIDER','COMPANY')),
    CONSTRAINT chk_damage CHECK (damage_category IN ('NONE','MINOR','MAJOR','ACCIDENT')),
    CONSTRAINT chk_closed_has_liability CHECK (status != 'CLOSED' OR liability IS NOT NULL)
);

CREATE INDEX idx_sj_tenant_status ON service_jobs(tenant_id, status);
CREATE INDEX idx_sj_tenant_queue ON service_jobs(tenant_id, queue);
CREATE INDEX idx_sj_vehicle ON service_jobs(vehicle_id);

-- One active job per vehicle per tenant
CREATE UNIQUE INDEX idx_sj_one_active_per_vehicle
    ON service_jobs(tenant_id, vehicle_id)
    WHERE status != 'CLOSED';
```

### `service_job_events`

```sql
CREATE TABLE service_job_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    job_id      UUID NOT NULL REFERENCES service_jobs(id),
    queue       VARCHAR(20) NOT NULL,
    vehicle_state VARCHAR(20) NOT NULL,
    actor       VARCHAR(100) NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    occurred_on TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_evt_queue CHECK (queue IN ('ASSESSMENT','MINOR_REPAIR','MAJOR_REPAIR','ACCIDENT','WARRANTY','INSURANCE','PARTS_WAITING','QC_PENDING','READY_TO_DEPLOY'))
);

CREATE INDEX idx_sje_job ON service_job_events(job_id);
CREATE INDEX idx_sje_actor ON service_job_events(tenant_id, actor, occurred_on);
```

No UPDATE, no DELETE. Append only.

### `service_job_items`

```sql
CREATE TABLE service_job_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    job_id      UUID NOT NULL REFERENCES service_jobs(id),
    label       VARCHAR(200) NOT NULL,
    cost_paise  BIGINT NOT NULL,
    kind        VARCHAR(10) NOT NULL DEFAULT 'OTHER',

    CONSTRAINT chk_item_kind CHECK (kind IN ('PART','LABOUR','OTHER')),
    CONSTRAINT chk_cost_positive CHECK (cost_paise >= 0)
);

CREATE INDEX idx_sji_job ON service_job_items(job_id);
```

### `qc_inspections`

```sql
CREATE TABLE qc_inspections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    job_id      UUID NOT NULL REFERENCES service_jobs(id),
    vehicle_id  VARCHAR(20) NOT NULL,
    checks      JSONB NOT NULL,
    passed      BOOLEAN NOT NULL,
    inspector   VARCHAR(100) NOT NULL,
    notes       TEXT,
    inspected_on TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_checks_not_empty CHECK (checks != '{}'::jsonb)
);

CREATE INDEX idx_qci_job ON qc_inspections(job_id);
CREATE INDEX idx_qci_vehicle ON qc_inspections(vehicle_id);
```

Backend validates `checks` keys against: `{brakes, tyres, battery, lights, horn, mirrors, throttle, frame, road_test}`.

### RLS

```sql
ALTER TABLE service_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_jobs
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Same for service_job_events, service_job_items, qc_inspections
```

### Entity relationship

```
service_jobs  1──N  service_job_events   (activity log)
service_jobs  1──N  service_job_items    (cost breakdown)
service_jobs  1──N  qc_inspections       (QC attempts, usually 1-2)
service_jobs  N──1  vehicles             (FK by vehicle_id)
service_jobs  N──1  riders               (nullable FK by rider_id)
```

---

## 4. REST API Endpoints

Base path: `/api/v1/service`. All require JWT. Tenant from token → RLS.

### Service Jobs

| Method | Path | Body | Returns | Role gate |
|--------|------|------|---------|-----------|
| `GET` | `/jobs` | — | `Page<ServiceJobResponse>` | ALL |
| `GET` | `/jobs/{id}` | — | `ServiceJobResponse` | ALL |
| `POST` | `/jobs` | `CreateServiceJobRequest` | `ServiceJobResponse` | STAFF+ |
| `PUT` | `/jobs/{id}` | `UpdateServiceJobRequest` | `ServiceJobResponse` | STAFF+ |
| `POST` | `/jobs/{id}/close` | `CloseServiceJobRequest` | `ServiceJobResponse` | STAFF+ (not SERVICE_MANAGER) |

`GET /jobs` query params: `status`, `queue`, `source`, `vehicleId`, `page`, `size`, `sort`, `q`.

`POST /close` is separate from `PUT` because close has its own payload shape (items, liability, technician). Separate endpoint keeps validation clean.

### QC Inspections

| Method | Path | Body | Returns | Role gate |
|--------|------|------|---------|-----------|
| `POST` | `/jobs/{id}/qc` | `SubmitQcRequest` | `QcInspectionResponse` | STAFF+ |
| `GET` | `/jobs/{id}/qc` | — | `QcInspectionResponse[]` | ALL |

### Dashboard

| Method | Path | Returns | Role gate |
|--------|------|---------|-----------|
| `GET` | `/queues/counts` | `Map<ServiceQueue, Integer>` | ALL |

### Facade (internal Java, not REST)

```java
public interface ServiceJobFacade {
    ServiceJob openJob(UUID tenantId, String vehicleId, UUID riderId,
                       ServiceJobSource source, DamageCategory damage,
                       String damageNotes, String actor);
}
```

---

## 5. State Machine Enforcement

Frontend suggests, backend decides. All routing logic from `serviceWorkflow.ts` moves to `ServiceJobService`.

### Vehicle state transitions (service-triggered)

| Action | Vehicle state change | Trigger |
|--------|---------------------|---------|
| Job opened (NONE damage) | → QC_PENDING | `ServiceJobService.create()` |
| Job opened (MINOR/MAJOR) | → UNDER_REPAIR | `ServiceJobService.create()` |
| Job opened (ACCIDENT) | → ACCIDENT | `ServiceJobService.create()` |
| Queue changed | → `QUEUE_STATE[newQueue]` | `ServiceJobService.update()` |
| QC passed | → READY_TO_DEPLOY | `QcInspectionService.submit()` |
| QC failed | → UNDER_REPAIR | `QcInspectionService.submit()` |
| Job closed | no change | `ServiceJobService.close()` |

Job close does NOT change vehicle state. QC pass releases the bike. These are decoupled.

### Queue → Vehicle state mapping

```java
ASSESSMENT      → UNDER_REPAIR
MINOR_REPAIR    → UNDER_REPAIR
MAJOR_REPAIR    → UNDER_REPAIR
ACCIDENT        → ACCIDENT
WARRANTY        → UNDER_REPAIR
INSURANCE       → UNDER_REPAIR
PARTS_WAITING   → UNDER_REPAIR
QC_PENDING      → QC_PENDING
READY_TO_DEPLOY → READY_TO_DEPLOY
```

### Damage → Queue routing

```java
NONE     → QC_PENDING
MINOR    → MINOR_REPAIR
MAJOR    → MAJOR_REPAIR
ACCIDENT → ACCIDENT
```

### Validation rules

**On create:**
1. Vehicle exists, belongs to tenant
2. Vehicle state legal for service (DEPLOYED, INDUCTED, RECOVERY — not UNDER_REPAIR, not RETIRED)
3. No open job for same vehicle (partial unique index enforces)
4. If queue provided, must be compatible with damage category
5. Sync: vehicle state → `QUEUE_STATE[queue]`
6. Append first event

**On update:**
1. Job OPEN or IN_PROGRESS (not CLOSED)
2. Queue transition legal (can't skip to READY_TO_DEPLOY without QC)
3. Sync: vehicle state if queue maps to different state
4. Status → IN_PROGRESS if still OPEN
5. Recalculate total from items
6. Append event

**On close:**
1. Not already CLOSED
2. Liability required
3. Items replace existing — final cost freeze
4. Total = sum of items, frozen
5. Status=CLOSED, closed_on=now()
6. Append final event
7. Async: emit `ServiceJobClosedEvent` if liability RIDER or DEPOSIT

**On QC submit:**
1. Job exists, vehicle in QC_PENDING
2. All 9 check keys present
3. Passed = all true
4. If passed: vehicle→RTD, queue→RTD
5. If failed: vehicle→UNDER_REPAIR, queue→MINOR_REPAIR
6. Append event
7. Multiple attempts allowed

### Async: `ServiceJobClosedEvent`

```java
@Async @EventListener
public void onJobClosed(ServiceJobClosedEvent event) {
    if (event.liability() == COMPANY) return;
    paymentService.createRiderCharge(
        event.riderId(), event.jobId(), event.vehicleId(),
        event.totalCostPaise(), event.liability(), event.tenantId()
    );
}
```

Phase 2 with RabbitMQ adds retry + dead-letter.

### Concurrency

Partial unique index `idx_sj_one_active_per_vehicle` enforces one open job per bike. Two concurrent deboards: first wins, second gets 409.

---

## 6. Work Split & Build Order

### Dependencies

```
S0: Spring Boot skeleton + auth + RLS + tenants (SMK)
  ├── S1: Vehicle module (SMK)        ║  S2: Rider module (Abhiram)  — parallel
  │                                    ║  S3: User/RBAC module (SMK)
  └── S4: Service module (SMK)  ← needs S1 + S2
       ├── S5: Assignment module (Abhiram) ← uses ServiceJobFacade
       └── S6: Payment module (SMK) ← listens to ServiceJobClosedEvent
```

### Build order

| Stage | What | Owner | Depends on | Test gate |
|-------|------|-------|------------|-----------|
| S0 | Boot skeleton, JWT, TenantFilter, RLS, Flyway baseline, Docker Compose, CI | SMK | — | Login → JWT → /auth/me returns correct tenant |
| S1 | Vehicle CRUD, state machine, lifecycle events, bulk upload | SMK | S0 | INDUCTED→QC_PENDING works; invalid transition → 409 |
| S2 | Rider CRUD, KYC, Aadhaar masking | Abhiram | S0 | Rider created with masked Aadhaar |
| S3 | User CRUD, role management, RBAC on all endpoints | SMK | S0 | FLEET_STAFF can't hit /payments/**; SERVICE_MANAGER can't close jobs |
| S4 | Service module (this spec) | SMK | S0, S1, S2 | 17-scenario test matrix (see below) |
| S5 | Assign, exchange, deboard — deboard/exchange call facade | Abhiram | S0–S4 | Deboard MINOR → service job created, vehicle=UNDER_REPAIR |
| S6 | Payment: charges, run, receipts, overdue, dunning | SMK | S0, S2, S4 | Close job liability=RIDER → charge exists → appears in payment run |

### Parallel tracks

```
Week 1-2:  SMK → S0
Week 2-3:  SMK → S1  ║  Abhiram → S2
Week 3:    SMK → S3
Week 3-5:  SMK → S4  ║  Abhiram → S5 shell (CRUD minus facade)
Week 5-6:  Abhiram wires S5 to facade  ║  SMK → S6
Week 6:    Integration testing, frontend swap
```

### S4 test matrix

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Create job — no damage | queue=QC_PENDING, vehicle→QC_PENDING |
| 2 | Create job — minor | queue=MINOR_REPAIR, vehicle→UNDER_REPAIR |
| 3 | Create job — accident | queue=ACCIDENT, vehicle→ACCIDENT |
| 4 | Duplicate job — same vehicle | 409 Conflict |
| 5 | Update — change queue | Queue updated, event appended |
| 6 | Update — move to QC | Vehicle→QC_PENDING |
| 7 | Close — with liability | Status=CLOSED, total frozen |
| 8 | Close — no liability | 400 Bad Request |
| 9 | Close — triggers charge | Async RiderCharge created |
| 10 | Close — company pays | No RiderCharge |
| 11 | QC pass | Vehicle→RTD, queue→RTD |
| 12 | QC fail | Vehicle→UNDER_REPAIR, queue→MINOR_REPAIR |
| 13 | QC — missing check key | 400 Bad Request |
| 14 | QC — second attempt | 2 rows, vehicle ends at RTD |
| 15 | RLS isolation | Tenant B sees nothing from Tenant A |
| 16 | Role gate — SERVICE_MANAGER close | 403 Forbidden |
| 17 | Queue counts | Correct counts per queue |

### Frontend swap

| Backend stage | Frontend file | Mock removed |
|---------------|---------------|-------------|
| S1 | `api/vehicles.ts` | `mocks/vehicles.ts` |
| S2 | `api/riders.ts` | `mocks/riders.ts` |
| S3 | `api/users.ts` | `mocks/users.ts` |
| S4 | `api/serviceJobs.ts` | `mocks/serviceJobs.ts` |
| S5 | `api/assignments.ts` | `mocks/riders.ts` (assignment part) |
| S6 | `api/payments.ts` | `mocks/payments.ts` |

### Abhiram's contract

One interface, published at start of S4:

```java
public interface ServiceJobFacade {
    ServiceJob openJob(UUID tenantId, String vehicleId, UUID riderId,
                       ServiceJobSource source, DamageCategory damage,
                       String damageNotes, String actor);
}
```
