# S5 — Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the assignment module — assign a bike to a rider, exchange a rider's bike, and deboard a rider (bike back, rider off the active register). Every return routes the bike through the S4 facade, so a damaged bike cannot skip the workshop. The rider's `currentVehicleId` and the bike's `currentRiderId`/`currentRiderName` — deliberately absent from the entities — become real, answered from the assignment table.

**Architecture:** One Spring module, `com.evrental.assignment`, on the S0 floor. One table behind Flyway (`V009__assignments.sql`), row-level security through V001's `enable_tenant_rls` helper. The module publishes `AssignmentQuery` — the read facade the rider and vehicle modules inject — and calls `ServiceJobFacade.openJob` (S4) and `VehicleTransitions.transitionState` (S1) for every move. The rider's status door (`markDeboarded`) lives in `RiderService`, the way `transitionState()` is the only door to a bike's state.

**Tech Stack:** Spring Boot 4.1.1, Java 21, Postgres 16, Flyway, JPA, Testcontainers.

**Spec:** `docs/BUILD.md` S5 row ("Assignments: assign, exchange, deboard (calls facade) — done when: Deboard minor → job created"), the contract in `frontend/app/src/types/assignment.ts` + `lib/api/assignments.ts` (OWNER SMK), the mock behaviour in `frontend/app/src/mocks/assignments.ts`-equivalent (`lib/api/assignments.ts`), and RBAC from `docs/backend/RBAC.md` (Assignments section = SA/FA/FS; conflict #4: FS records the deboard, FA approves the settlement — the approval is S6's second half, so S5 only records).

## Global Constraints

- Migration file is **`V009__assignments.sql`** (next free number).
- RLS is added with `SELECT enable_tenant_rls('assignments')`, **not** a hand-written policy (migration README rule 1).
- Money is paise, `BIGINT`, never a float. The wire already carries paise (`outstandingRent`/`depositRefund` are `Paise` in the contract).
- Errors leave through `NotFoundException` (404), `ConflictException` (409), `ValidationException` (422). Nothing builds an error by hand.
- Role gates are `@PreAuthorize` on the controller, matching `docs/backend/RBAC.md`: **all assignment endpoints are SA/FA/FS** — SERVICE_MANAGER gets 403 everywhere on assignments.
- Nothing here filters by tenant. RLS does that on the transaction the TenantFilter opened.
- **The one handshake with S4:** `ServiceJobFacade.openJob(tenantId, vehicleId, riderId, source, damage, damageNotes, actor)` — the assignment module injects this interface and imports nothing else from `com.evrental.service`. The caller must already be inside a transaction: the job, the bike's move and the deboard commit together.
- **The only door to a bike's state:** `VehicleTransitions.transitionState(vehicleId, toState, note, actorUserId, actorName)`. The assignment module never writes `vehicles.state` itself.
- **The only door to a rider's status:** `RiderService.markDeboarded(riderId)`. The assignment module never writes `riders.status` itself.
- `currentVehicleId`/`currentRiderId` are **not stored** on the entities (the S2/S1 javadocs say why). The open assignment row is the single source of truth; `AssignmentQuery` answers the derived fields.
- Every return — deboard or exchange, damaged or not — calls `openJob`. The mock's `recordServiceReturn` always creates/updates a job (an undamaged return goes to the QC bench), and the facade's `DamageCategory.defaultQueue()` is the same rule: NONE → QC_PENDING, MINOR → MINOR_REPAIR, MAJOR → MAJOR_REPAIR, ACCIDENT → ACCIDENT.

### Decisions agreed with the user (2026-09-28)

1. **Deboard settlement money (Q1):** `outstandingRent` and `depositRefund` are stored as **facts on the assignment row** (`outstanding_rent_paise`, `deposit_refund_paise`). S5 writes nothing to the ledger — `rider_charges` cannot hold a refund (amounts are `>= 0`, liability is RIDER/DEPOSIT, and a negative row would need a schema change). FA approval and the ledger rows are S6's second half (SMK's money work, RBAC conflict #4).
2. **Vehicle module files (Q2):** SMK approved. S5 fills `currentRiderId`/`currentRiderName` on `VehicleResponse`/`VehicleDetailResponse` and the detail's `assignments` history, wired through `AssignmentQuery` — the vehicle controller injects the interface and imports nothing else from the assignment module.
3. **Facade routing vs operator override (Q3):** S5 calls `openJob` as-is — the bike goes where the damage category routes it. The operator's chosen `nextVehicleState` is recorded on the assignment row as a fact. When the operator overrides the condition's default destination, the bike's actual state (facade-routed) and the recorded destination diverge; that is documented in the plan and the code, and the mock's `queueForDisposition` divergence is noted in WORK_SPLIT.md.

### Deliberate divergences from the mock

- **The bike's state after a return is the facade's, not the operator's.** The mock moves the bike to `nextVehicleState` and queues by `queueForDisposition(nextState, category)`; the backend routes by damage category (`openJob`). For the default destination they agree exactly (`CONDITION_DEFAULT_STATE[category]` == `category.defaultQueue().vehicleState()`). Only an override diverges, and the override is recorded, not acted on.
- **A bike that already has an open job 409s.** The mock updates the existing job; the facade refuses a second open job. The invariant (a bike out with a rider has no open job) means this should not happen; when it does, the operator resolves the job first.
- **`returnNote` rules are 422s, not 400s.** The mock throws 400; the backend's `ValidationException` is 422, the same shape the S4 rules moved to. The wording is the mock's.
- **`GET /riders/assignable` excludes riders holding a bike.** The mock's `listAssignableRiders` filters `!r.currentVehicleId`; S2's version returned all ACTIVE riders. S5 makes it match the mock.

## Review Focus

Five things the contract implies but does not give a test:

1. **One rider, one bike, one open assignment.** The partial unique indexes on open assignments are the real guarantee; a second assign to the same rider or bike must 409 (via the pre-check naming the field, and the index backing it up under a race).
2. **A return cannot skip the workshop.** Every deboard/exchange calls `openJob`; an undamaged return lands in QC_PENDING, a minor one in UNDER_REPAIR (BUILD.md's "Deboard minor → job created").
3. **The return-note rules.** Destination must be a return destination; damage items required when damaged, forbidden when not; an override of the condition's default destination needs a note.
4. **The derived fields.** After an assign, the rider's `currentVehicleId` and the bike's `currentRiderId`/`currentRiderName` are set; after a deboard they are cleared; the vehicle detail's `assignments` history lists closed and open rows.
5. **SERVICE_MANAGER on assignments.** RBAC.md says the Assignments section is SA/FA/FS; SM must get 403 on every assignment endpoint.

---

## File Structure

```
backend/src/main/resources/db/migration/
  V009__assignments.sql            assignments table, RLS, the open-assignment guards

backend/src/main/java/com/evrental/assignment/
  ExchangeReason.java              enum: the 7 exchange reasons (types/assignment.ts)
  DeboardReason.java               enum: the 9 deboard reasons
  Assignment.java                  entity (period model: open row, closed on return)
  AssignmentRepository.java        open-by-rider/vehicle, history, open rows
  AssignmentQuery.java             the read facade rider/vehicle modules inject
  CurrentRider.java                record (id, name) — the vehicle module's derived fields
  AssignmentHistoryRow.java        record mirroring types/vehicle.ts AssignmentHistoryRow
  AssignmentQueryService.java      the AssignmentQuery implementation
  AssignmentService.java           assign/exchange/deboard, the return-note rules
  AssignmentController.java        POST /api/v1/assignments/{assign,exchange,deboard}
  AssignVehicleRequest.java        the assign body
  ExchangeVehicleRequest.java      the exchange body + DamageItem
  DeboardRiderRequest.java         the deboard body + DamageItem
  package-info.java

backend/src/main/java/com/evrental/rider/
  RiderService.java                + markDeboarded door, toResponse, assignable/assigned/vehicleState wired
  RiderController.java             maps through riderService::toResponse
  RiderRepository.java             + findByIdIn, + riderIds param on search/countByStatus
  RiderResponse.java               from(Rider, String currentVehicleId)

backend/src/main/java/com/evrental/vehicle/
  VehicleController.java           + AssignmentQuery: currentRiderId/currentRiderName/assignments
  VehicleResponse.java             from(Vehicle, CurrentRider)
  VehicleDetailResponse.java       from(Vehicle, lifecycle, CurrentRider, history)

backend/src/main/java/com/evrental/platform/
  DevFleetSeeder.java              + the ten designed riders hold their bikes

backend/src/test/java/com/evrental/
  AssignmentTestBase.java          own tenants (5000…/6000…), users, riders, bikes, token helpers
  AssignmentSchemaTest.java        Task 1
  AssignmentAssignTest.java        Task 4
  AssignmentExchangeTest.java      Task 5
  AssignmentDeboardTest.java       Task 6
  AssignmentRbacTest.java          Task 7
  RiderReadTest.java               vehicleState/assigned/assignable now live (Task 8)
  VehicleReadTest.java             currentRiderId/assignments now live (Task 8)
```

---

### Task 1: Migration and schema

**Files:** Create `V009__assignments.sql`; Test: `AssignmentSchemaTest.java`

- [ ] `assignments` table: UUID PK, `tenant_id REFERENCES tenants(id)`, `rider_id REFERENCES riders(id)`, `vehicle_id REFERENCES vehicles(id)` (all NOT NULL — an assignment always names both), `started_on DATE NOT NULL`, `ended_on DATE` (null while open), `reason VARCHAR(20)`, `return_condition VARCHAR(10)`, `next_vehicle_state VARCHAR(20)`, `note TEXT`, `damage_notes TEXT`, `outstanding_rent_paise BIGINT`, `deposit_refund_paise BIGINT`, `closed_by VARCHAR(100)`, `created_on TIMESTAMPTZ`.
- [ ] CHECKs: `chk_assignment_reason` (the 7 exchange + 9 deboard reasons), `chk_assignment_return_condition` (NONE/MINOR/MAJOR/ACCIDENT), `chk_assignment_next_state` (the 9 vehicle states), `chk_assignment_money` (both money columns `>= 0` when present), `chk_assignment_period` (an open row carries no return facts; a closed row carries condition/reason/destination).
- [ ] `CREATE UNIQUE INDEX idx_assignments_open_rider ON assignments (tenant_id, rider_id) WHERE ended_on IS NULL` — one open assignment per rider.
- [ ] `CREATE UNIQUE INDEX idx_assignments_open_vehicle ON assignments (tenant_id, vehicle_id) WHERE ended_on IS NULL` — one open assignment per bike.
- [ ] `CREATE INDEX idx_assignments_rider ON assignments (tenant_id, rider_id, started_on)` and `idx_assignments_vehicle ON assignments (tenant_id, vehicle_id, started_on)` — the history reads.
- [ ] `SELECT enable_tenant_rls('assignments')`.
- [ ] Test: the app boots, migration applied, `assignments` present, RLS enabled, both unique partial indexes refuse a second open row, the period CHECK refuses a closed row without return facts.

### Task 2: Enums and entity

**Files:** Create `ExchangeReason`, `DeboardReason`, `Assignment.java`.

- [ ] `ExchangeReason`/`DeboardReason` match the contract values exactly.
- [ ] `Assignment` mirrors `Rider`'s entity style: UUID id, `tenant_id`, `@Enumerated(EnumType.STRING)` for `returnCondition` (reusing `com.evrental.service.DamageCategory` — the facade already exposes it) and `nextVehicleState` (`com.evrental.vehicle.VehicleState`), `@CreationTimestamp`. `reason` is a String (the two enums differ; the CHECK covers the values).

### Task 3: Repository and the read facade

**Files:** Create `AssignmentRepository.java`, `AssignmentQuery.java`, `CurrentRider.java`, `AssignmentHistoryRow.java`, `AssignmentQueryService.java`.

- [ ] `AssignmentRepository`: `findOpenByRiderId`, `findOpenByVehicleId`, `findByVehicleIdOrderByStartedOnDesc` (history), `findByEndedOnIsNull` (all open rows).
- [ ] `AssignmentQuery` (the published read API — the only thing rider/vehicle modules import):
  - `CurrentRider currentRiderOf(UUID vehicleId)` — the bike's rider, or null
  - `Map<UUID, CurrentRider> currentRidersOf(Collection<UUID> vehicleIds)` — batch for the vehicle list
  - `List<AssignmentHistoryRow> historyFor(UUID vehicleId)` — the detail's assignments
  - `String currentVehicleIdOf(UUID riderId)` — the rider's bike (registry id), or null
  - `Map<UUID, String> currentVehicleIdsOf(Collection<UUID> riderIds)` — batch for the rider list
  - `Set<UUID> riderIdsHoldingBikes()` — assignable/assigned
  - `Set<UUID> riderIdsWhoseVehicleIsIn(VehicleState state)` — the rider list's vehicleState filter
- [ ] `AssignmentQueryService` implements it from the repository + `RiderRepository.findByIdIn` (names for `CurrentRider`/history rows). `days` = `endedOn - startedOn` (or `today - startedOn` while open); `planAmount` = the rider's `planAmountPaise`.

### Task 4: Assign

**Interfaces:** `AssignmentService.assign(AssignVehicleRequest, UUID tenantId, UUID actorUserId, String actorName) -> Rider`

- [ ] Rider must exist (404), be ACTIVE (409: "X is inactive and cannot hold a bike", field `riderId`), and hold no bike (409: "X already holds Y. Use Exchange vehicle instead.", field `riderId`).
- [ ] Bike must exist (404), be READY_TO_DEPLOY with no rider (409: "X is not Ready to Deploy", field `vehicleId`).
- [ ] Open the assignment row (`startedOn`, `note`), then `transitionState(vehicleId, DEPLOYED, note, actorUserId, actorName)` — same transaction.
- [ ] The unique indexes back the pre-checks under a race; a `DataIntegrityViolationException` surfaces as a 409 (the handler already does this).
- [ ] Test: assign returns the rider with `currentVehicleId` set and the bike DEPLOYED with `currentRiderId`/`currentRiderName`; the four 409s; 404s; the response shape.

### Task 5: Exchange

**Interfaces:** `AssignmentService.exchange(ExchangeVehicleRequest, UUID tenantId, UUID actorUserId, String actorName) -> Rider`

- [ ] Rider must exist (404), be ACTIVE (409), and be holding `fromVehicleId` (409: "X is not holding Y", field `fromVehicleId`).
- [ ] `toVehicleId != fromVehicleId` (422: "Pick a different bike to exchange onto", field `toVehicleId`); the to-bike must exist (404) and be deployable (409).
- [ ] The return-note rules (422s, mock wording): destination in RETURN_DESTINATIONS; damage items required when damaged, forbidden when not; an override of `CONDITION_DEFAULT_STATE[condition]` needs a note.
- [ ] Close the old assignment (endedOn, reason, returnCondition, nextVehicleState, note, damageNotes, closedBy), call `openJob(tenantId, fromVehicleId, riderId, EXCHANGE, condition, damageNotes, actorName)` — the bike moves where the condition routes it — then open the new assignment and `transitionState(toVehicleId, DEPLOYED, ...)`. One transaction.
- [ ] Test: exchange closes the old row and opens the new one; the returned bike lands in the condition's queue state; a minor-damage exchange opens a job with source EXCHANGE; the 409s/422s.

### Task 6: Deboard

**Interfaces:** `AssignmentService.deboard(DeboardRiderRequest, UUID tenantId, UUID actorUserId, String actorName) -> Rider`

- [ ] Rider must exist (404) and be holding `vehicleId` (409: "X is not holding Y", field `vehicleId`); the bike must exist (404).
- [ ] The return-note rules (as Task 5).
- [ ] Close the assignment with the return facts **including `outstandingRent`/`depositRefund`** (decision 1), call `openJob(tenantId, vehicleId, riderId, DEBOARD, condition, damageNotes, actorName)`, then `riderService.markDeboarded(riderId)`. One transaction.
- [ ] Test: deboard closes the assignment (money facts stored), the rider is DEBOARDED with no bike, the bike lands in the condition's queue state, a minor deboard creates a job (BUILD.md done-when), the 409s/422s.

### Task 7: RBAC

**Files:** `AssignmentController`; Test: `AssignmentRbacTest.java`

- [ ] Every assignment endpoint `@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")` — SERVICE_MANAGER gets 403 (Review Focus 5).
- [ ] No token → 401.
- [ ] Test: FS can assign/exchange/deboard; SM gets 403 on all three; no token → 401.

### Task 8: The derived fields go live

**Files:** `RiderService`, `RiderController`, `RiderResponse`, `RiderRepository`, `VehicleController`, `VehicleResponse`, `VehicleDetailResponse`; update `RiderReadTest`, `VehicleReadTest`.

- [ ] `RiderResponse.from(Rider, String currentVehicleId)`; `RiderService.toResponse(Rider)` fills it from `AssignmentQuery.currentVehicleIdsOf` (batch for lists, single for detail/onboard). `RiderController` maps through `riderService::toResponse`.
- [ ] `RiderService.search`/`facets`: the `vehicleState` filter now matches riders whose open assignment's bike is in that state (via `riderIdsWhoseVehicleIsIn`, passed into the repository query — pagination stays in SQL). `assignable()` = ACTIVE minus holders; `assigned()` = ACTIVE holders.
- [ ] `RiderService.markDeboarded(UUID)` — the status door: 404 if unknown, set DEBOARDED.
- [ ] `VehicleController` injects `AssignmentQuery`: `VehicleResponse.from(v, currentRider)` on list/create/transition; `VehicleDetailResponse.from(v, lifecycle, currentRider, history)` on get/update. `VehicleResponse.from` keeps a one-arg overload for the create path (a fresh bike has no rider).
- [ ] Update `RiderReadTest`: `aVehicleStateFilterMatchesNothingUntilS5` becomes a live filter test; `assignedIsEmptyUntilS5` becomes a live test; `assignableIsTheActiveRegister` excludes holders; `listsTheRegistersRiders`/`onboardReturnsTheFullRiderShape` still expect `currentVehicleId` absent for a rider with no bike.
- [ ] Update `VehicleReadTest`/`VehicleCreateTest`/`VehicleTransitionTest` where they assert `currentRiderId` null — the fixture riders hold no bike, so the assertions stay true unless a test assigns one.

### Task 9: Dev seed

**Files:** `DevFleetSeeder.java`

- [ ] After `seedRiders`, seed the ten designed riders' open assignments onto their bikes (the 7 named in the CSV are DEPLOYED; the 3 missing — BLRSS0396, BLRSS0403, FBLSS0097 — adopt a spare DEPLOYED bike like the mock does), `started_on 2026-04-08`, same gate and idempotency ("if the tenant already has any assignment, skip").

---

## What shipped (2026-09-28)

**Migration** — `V009__assignments.sql`: the `assignments` table (UUID PK, tenant/rider/vehicle FKs, `started_on`/`ended_on` period, reason/return_condition/next_vehicle_state/note/damage_notes, the two money facts, `closed_by`, created_on), the period and money CHECKs, the two partial unique indexes on open assignments (one per rider, one per bike), the history indexes, and tenant RLS.

**Module** — `com.evrental.assignment`: `ExchangeReason`/`DeboardReason` (contract values), `Assignment` entity (period model; `returnCondition` reuses `DamageCategory`, `nextVehicleState` is `VehicleState`), `AssignmentRepository` (open-by-rider/vehicle, history, all-open), `AssignmentQuery` + `AssignmentQueryService` (the read facade: `currentRiderOf`/`currentRidersOf`/`historyFor` for the vehicle module, `currentVehicleIdOf`/`currentVehicleIdsOf`/`riderIdsHoldingBikes`/`riderIdsWhoseVehicleIsIn` for the rider module), `AssignmentService` (assign/exchange/deboard — every return calls `ServiceJobFacade.openJob`, every bike move goes through `VehicleTransitions.transitionState`, the deboard door is `RiderService.markDeboarded`; the return-note rules are the mock's wording as 422s; settlement money stored as facts on the row), `AssignmentController` (POST `/api/v1/assignments/{assign,exchange,deboard}`, SA/FA/FS, returns the updated `RiderResponse`).

**Rider module** — `RiderService` gains `markDeboarded` (the status door), `toResponse` (fills `currentVehicleId` from the assignment table), and live `assignable()`/`assigned()`/`vehicleState` filter; `RiderRepository` gains the `riderIds` param on search/counts (the query service reads names via `findAllById`); `RiderResponse.from(Rider, String)`.

**Vehicle module** — `VehicleController` injects `AssignmentQuery`; `VehicleResponse`/`VehicleDetailResponse` carry `currentRiderId`/`currentRiderName` and the detail's `assignments` history.

**Seeder** — `DevFleetSeeder` seeds the ten designed riders' open assignments (7 named bikes, 3 adopted from the deployed pool).

**Tests** — `AssignmentTestBase` (own tenants `5000…`/`6000…`, users, riders, bikes, token helpers), `AssignmentSchemaTest`, `AssignmentAssignTest`, `AssignmentExchangeTest`, `AssignmentDeboardTest`, `AssignmentRbacTest`; `RiderReadTest` renamed for the now-live derived fields (`VehicleCreateTest` needed no change — a fresh bike still has no rider).

**Verify** — `mvnw test`: 290/290 green (250 baseline + 39 new).

## What is deliberately not done

**The frontend swap.** `lib/api/assignments.ts` still serves mocks. Flipping it needs S5 (this stage) and S6's second half (payment periods and `paymentStatus`); the S2/S4 swaps are blocked on the same two. Recorded in WORK_SPLIT.md.

**The settlement.** `outstandingRent`/`depositRefund` are recorded facts; FA approval and the ledger rows (charge + deposit refund) are S6's second half — RBAC conflict #4 says FS records, FA approves, and money stays admin work.

**The operator override.** `nextVehicleState` is recorded but the bike goes where the damage category routes it (decision 3). If Ashok wants the override to actually move the bike, that is a facade change — a conversation with SMK, not an edit.

**Rider re-activation.** A deboarded rider is DEBOARDED; re-activation is the next onboarding (the mock's rule), and no separate endpoint exists.