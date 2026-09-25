# S4 — Service Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the service module — a bike goes into the workshop, moves through nine queues, passes QC, and closes with someone named to pay for it.

**Architecture:** One Spring module, `com.evrental.service`, on the S0 floor. Four tables behind Flyway, row-level security through V001's `enable_tenant_rls` helper. Every bike-state change goes through `VehicleTransitions.transitionState()` — the service module never writes `vehicles.state`. Opening and closing a job change the bike in the same transaction, because an operator is watching the screen; the rider's charge leaves on the async pool, because it only matters at the next payment run.

**Tech Stack:** Spring Boot 4.1.1, Java 21, Postgres 16, Flyway, JPA, Testcontainers.

**Spec:** `docs/backend/SERVICE_MANAGEMENT.md` (approved 2026-09-22), with RBAC from `docs/backend/RBAC.md`.

## Global Constraints

- Migration file is **`V006__service_management.sql`**. The spec says V003; that number was taken by vehicles, and V004/V005 are taken too. Flyway checksums make an edited migration a broken database.
- RLS is added with `SELECT enable_tenant_rls('table_name')`, **not** a hand-written policy. The spec's inline `CREATE POLICY` omits `FORCE`, and without `FORCE` the table owner — which the application user is — ignores its own policy. V001 says so in a comment.
- Money is paise, `BIGINT`, never a float. Rupees only at the edge.
- `service_job_events` is append-only. One INSERT per action, never an UPDATE or DELETE.
- Every list is paginated through `PageResponse`. No endpoint returns everything.
- Errors leave through `NotFoundException` (404), `ConflictException` (409), `ValidationException` (422). Nothing builds an error by hand.
- Role gates are `@PreAuthorize` on the controller, matching `docs/backend/RBAC.md`: read is open to all four roles; create/update/QC are SA/FA/FS/SM; **close is SA/FA/FS and not SERVICE_MANAGER** (conflict #2 — a service manager works the bike but does not decide who pays).

### Deviation from the spec, and why

The spec's `service_jobs.vehicle_id` is `VARCHAR(20)` holding a registry id like `BLRSS0428`. This plan stores **`vehicle_id UUID NOT NULL REFERENCES vehicles(id)`** instead, and keeps the registry id on the wire.

Three reasons: `registry_id` is unique only *per tenant*, so a bare string is not a key; `VehicleTransitions.transitionState()` — the only door to a state change — takes a `UUID`, so a string column means a lookup on every transition anyway; and a `VARCHAR` link has no referential integrity, so a job can point at a bike that was never there.

The external contract is unchanged: `frontend/app/src/types/serviceJob.ts` says `vehicleId: string`, and `VehicleResponse.id` is already the registry id, so requests and responses still carry `BLRSS0428`. The translation happens once, in `ServiceJobService`.

## Review Focus

Five things the spec implies but does not give a test:

1. **Two operators deboard the same bike at once.** The partial unique index is the guard; the second caller must get a 409 with a sentence, not a constraint-violation stack trace. Pinned in Task 4.
2. **A job opened against another tenant's bike.** RLS hides the vehicle, so the lookup must 404 rather than open a job with a dangling id. Pinned in Task 4.
3. **A QC submission missing one of the nine checks**, or carrying a tenth unknown one. Must be 422 naming the field, not a job silently marked passed. Pinned in Task 7.
4. **Closing a job twice.** The second close must not re-freeze the total or fire a second charge — a rider billed twice is the failure that matters. Pinned in Task 8.
5. **A queue change to a queue whose bike state the machine refuses** (a RETIRED bike routed to MINOR_REPAIR). Must surface the state machine's own 409 sentence. Pinned in Task 5.

---

## File Structure

```
backend/src/main/resources/db/migration/
  V006__service_management.sql        4 tables, RLS, indexes

backend/src/main/java/com/evrental/service/
  ServiceQueue.java                   enum: 9 queues, each with the bike state it implies
  ServiceJobSource.java               enum: 7 ways a bike reaches service
  ServiceJobStatus.java               enum: OPEN, IN_PROGRESS, CLOSED
  ServiceLiability.java               enum: DEPOSIT, RIDER, COMPANY
  DamageCategory.java                 enum: NONE, MINOR, MAJOR, ACCIDENT + default queue
  ServiceJob.java                     entity
  ServiceJobEvent.java                entity (append-only)
  ServiceJobItem.java                 entity (cost line)
  QcInspection.java                   entity (JSONB checks)
  ServiceJobRepository.java
  ServiceJobEventRepository.java
  ServiceJobItemRepository.java
  QcInspectionRepository.java
  ServiceJobFacade.java               the one interface other modules call
  ServiceJobService.java              open/update/close/qc, the only writer
  ServiceJobClosedEvent.java          record published on close
  ServiceJobController.java           /api/v1/service/jobs
  QcInspectionController.java         /api/v1/service/jobs/{id}/qc
  (queue counts live on ServiceJobController, not a controller of their own)
  ServiceJobReader.java               list/detail/qc-history/queue counts
  dto/  CreateServiceJobRequest, UpdateServiceJobRequest, CloseServiceJobRequest,
        SubmitQcRequest, ServiceJobItemRequest, ServiceJobResponse,
        ServiceJobEventResponse, ServiceJobItemResponse, QcInspectionResponse,
        QueueCountResponse

backend/src/test/java/com/evrental/
  ServiceJobTestBase.java             tenant + users + a bike, and the token helpers
  ServiceJobOpenTest.java             Task 4
  ServiceJobUpdateTest.java           Task 5
  ServiceJobReadTest.java             Task 6
  QcInspectionTest.java               Task 7
  ServiceJobCloseTest.java            Task 8
  ServiceJobRbacTest.java             Task 9
  ServiceJobFacadeTest.java           Task 10
```

---

### Task 1: Migration and schema

**Files:** Create `V006__service_management.sql`; Test: `ServiceJobSchemaTest.java`

- [ ] Four tables per the spec, with `vehicle_id UUID REFERENCES vehicles(id)`.
- [ ] `SELECT enable_tenant_rls(...)` on all four.
- [ ] Partial unique index `idx_sj_one_active_per_vehicle ON service_jobs(tenant_id, vehicle_id) WHERE status != 'CLOSED'`.
- [ ] Test: the app boots, migration applied, all four tables present and RLS enabled.

### Task 2: Enums

**Files:** Create the five enums.

- [ ] `ServiceQueue` carries the `VehicleState` each queue implies (spec's queue→state table), so routing is one lookup, not a switch in three places.
- [ ] `DamageCategory` carries its default queue (spec's damage→queue table).
- [ ] Test: every queue maps to a state the state machine knows.

### Task 3: Entities and repositories

**Files:** Create four entities, four repositories.

- [ ] `ServiceJob` with `@Version`-free optimistic simplicity; totals as `long totalCostPaise`.
- [ ] `QcInspection.checks` as JSONB mapped to `Map<String,Boolean>`.
- [ ] Repositories with the paged search the list endpoint needs (filters: status, queue, source, vehicleId).

### Task 4: Open a job

**Interfaces:** Produces `ServiceJobService.open(CreateServiceJobRequest, UUID tenantId, UUID actorUserId, String actorName) -> ServiceJob`

- [ ] Resolve registry id → vehicle, 404 if unknown *or another tenant's* (Review Focus 2).
- [ ] Refuse unless bike state is DEPLOYED, INDUCTED or RECOVERY — 409 otherwise.
- [ ] Queue defaults from damage category when not supplied.
- [ ] `transitionState()` to the queue's state, same transaction.
- [ ] First event logged.
- [ ] Catch the unique-index violation and rethrow as `ConflictException("This bike already has an open service job")` (Review Focus 1).

### Task 5: Update a job

- [ ] Refuse if CLOSED (409).
- [ ] Queue change → `transitionState()`; let the machine's 409 through (Review Focus 5).
- [ ] Status moves OPEN → IN_PROGRESS.
- [ ] Items replaced wholesale, total recomputed.
- [ ] Event logged.

### Task 6: Read — list, detail, queue counts

- [ ] `GET /jobs` paginated, filters, newest first.
- [ ] `GET /jobs/{id}` with events, items and QC history.
- [ ] `GET /queues/counts` — open jobs per queue.
- [ ] Registry ids resolved in one batch query per page, not N+1.

### Task 7: QC

- [ ] Nine checks required, exactly; missing or unknown key → 422 naming `checks` (Review Focus 3).
- [ ] All true → READY_TO_DEPLOY, queue READY_TO_DEPLOY; any false → UNDER_REPAIR, queue back to the repair queue.
- [ ] Multiple attempts allowed; each logged.

### Task 8: Close

- [ ] Liability required (422 if absent).
- [ ] Total frozen from items at close.
- [ ] Second close → 409, no second event, no second charge (Review Focus 4).
- [ ] `ServiceJobClosedEvent` published **after commit** when liability is RIDER or DEPOSIT; nothing when COMPANY.

### Task 9: RBAC

- [ ] Gates per RBAC.md; SERVICE_MANAGER gets 403 on close and 200 on update/QC.

### Task 10: Facade

- [ ] `ServiceJobFacade.openJob(...)` per the spec's signature, delegating to the service, so Abhiram's S5 deboard calls one method.

---

---

## What shipped (2026-09-25)

All ten tasks are built and green: **185/185 backend tests**, up from a 111
baseline, every one against a real Postgres in Docker. `./mvnw verify` is
BUILD SUCCESS.

| Area | Files | Tests |
|---|---|---|
| Migration | `V006__service_management.sql` | `ServiceJobSchemaTest` (4) |
| Enums, entities, repositories | 14 files in `com.evrental.service` | covered throughout |
| Open | `ServiceJobService.open` | `ServiceJobOpenTest` (10) |
| Update | `ServiceJobService.update` | `ServiceJobUpdateTest` (12) |
| QC | `ServiceJobService.submitQc`, `QcChecks` | `QcInspectionTest` (11) |
| Close + event | `ServiceJobService.close`, `ServiceJobClosedEvent` | `ServiceJobCloseTest` (9) |
| Read | `ServiceJobReader` | `ServiceJobReadTest` (13) |
| RBAC | `@PreAuthorize` on both controllers | `ServiceJobRbacTest` (9) |
| Facade | `ServiceJobFacade` | `ServiceJobFacadeTest` (6) |

Every Review Focus item has the test the plan promised.

### Three things the plan did not predict, found by the tests

1. **`DEPLOYED → QC_PENDING` is not a legal move.** The state machine requires
   a bike to come back before it can be inspected. An undamaged return now
   records the return and then goes to QC, which is what physically happened,
   rather than teleporting. See `moveIntoService`.
2. **Closing cannot force a release.** `UNDER_REPAIR → READY_TO_DEPLOY` is
   illegal by design — QC is the gate. Closing settles money and leaves the
   bike wherever the workshop left it. See `releaseIfRoadworthy`.
3. **The "which states may enter service" list was a second copy of the state
   machine, and it disagreed with it** — a Ready to Deploy bike with a
   newly-spotted fault could not be taken in. Replaced with one narrow rule
   (not retired), leaving the open-job check and the state machine to own the
   other two cases.

## What is deliberately not done

**The frontend swap.** `lib/api/serviceJobs.ts` still serves mocks, and
flipping it is not a one-line change — the mock `updateServiceJobRecord()`
does three jobs the backend splits into `PUT /jobs/{id}`,
`POST /jobs/{id}/close` and `POST /jobs/{id}/qc`, and it enforces rules that
exist nowhere on the server (a note is required; technician and work summary
are required before QC or release; a claim reference is required for
WARRANTY/INSURANCE/PARTS_WAITING; liability is required once the total is
non-zero; the rider must exist before anything is charged to them).

Flipping the switch today would silently drop all of those. The choice —
move the rules to the backend, or split `AssistanceJob.tsx`'s single save into
three calls — is a product decision, so it is written down rather than
guessed at. Recorded in WORK_SPLIT.md under "S4's frontend swap".
