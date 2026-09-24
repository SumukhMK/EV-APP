# S1 — Vehicles

Stage S1 from [`docs/BUILD.md`](../../BUILD.md). Owner: SMK. Built on the S0
floor: RLS tenant isolation, `PageResponse`, `ApiErrorResponse`, and the rule
that every write path is `@Transactional`.

Done when: a bike can be created, states can be transitioned, and an invalid
transition returns 409.

---

## What this stage owns

The vehicle registry and its lifecycle. Nine states, the rules for moving
between them, an append-only log of every move, and bulk induction from a CSV.

It publishes one method, `VehicleService.transitionState()`, which the service
module (S4) calls inside its own transaction. That method is the entire
handshake between this module and the rest of the system.

---

## The transition table

This did not exist anywhere before this stage. `types/vehicle.ts` points at an
`allowedTransitions` that was never written; `SERVICE_MANAGEMENT.md` describes
individual scenarios but no table. What follows is derived from the code and
documents that do exist, and is now the single source of truth.

| From | May move to |
|---|---|
| `INDUCTED` | `READY_TO_DEPLOY`, `UNDER_REPAIR`, `RETIRED` |
| `READY_TO_DEPLOY` | `DEPLOYED`, `UNDER_REPAIR`, `ACCIDENT`, `RETIRED` |
| `DEPLOYED` | `RETURNED`, `RECOVERY`, `ACCIDENT`, `UNDER_REPAIR` |
| `RETURNED` | `QC_PENDING`, `UNDER_REPAIR`, `ACCIDENT` |
| `RECOVERY` | `RETURNED`, `UNDER_REPAIR`, `ACCIDENT`, `RETIRED` |
| `UNDER_REPAIR` | `QC_PENDING`, `ACCIDENT`, `RETIRED` |
| `QC_PENDING` | `READY_TO_DEPLOY`, `UNDER_REPAIR` |
| `ACCIDENT` | `UNDER_REPAIR`, `RETIRED` |
| `RETIRED` | — terminal |

Where each row came from:

- **`RETURNED`** — `RETURN_DESTINATIONS` in `lib/serviceWorkflow.ts`, which
  removes `READY_TO_DEPLOY` deliberately: *"every return must go through QC or
  service first."*
- **`QC_PENDING`** — `releaseState()` returns `READY_TO_DEPLOY` on a pass;
  `SERVICE_MANAGEMENT.md` scenarios 11 and 14 confirm a failed QC returns to
  repair and a later pass still ends at `READY_TO_DEPLOY`.
- **`UNDER_REPAIR`** — the `QUEUE_STATE` mapping, where six of the nine service
  queues sit in `UNDER_REPAIR`.

A state may always transition to itself. That is a no-op: no write, no
lifecycle row, no error. Screens fire idempotent saves and should not be
punished for it.

### Three edges to confirm with Ashok

These are the ones the existing code does not settle. They are permitted in the
table above because forbidding a real operation is worse than permitting an
unreal one, but each is a guess:

1. **`DEPLOYED` → `UNDER_REPAIR`** — can a bike go straight into repair from the
   road, without a recorded return?
2. **`RECOVERY` → `RETURNED`** — does a recovered bike become a normal return,
   or go directly to repair?
3. **`INDUCTED` → `UNDER_REPAIR`** — is a bike that arrives broken repaired
   before it is ever made ready?

A fourth question for the same conversation: **`make`**. See "Known
compromises" below.

---

## Schema — `V003__vehicles.sql`

### `vehicles`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID NOT NULL` → `tenants` | |
| `registry_id` | `VARCHAR(20) NOT NULL` | `"BLRSS0428"` — the human-facing id |
| `chassis_number` | `VARCHAR(40) NOT NULL` | |
| `make` | `VARCHAR(60) NOT NULL` | derived from `model` |
| `model` | `VARCHAR(60) NOT NULL` | |
| `battery_type` | `VARCHAR(20) NOT NULL` | |
| `battery_vendor` | `VARCHAR(40)` | whose swap network the pack belongs to |
| `hub` | `VARCHAR(80) NOT NULL` | free text until hubs are modelled |
| `state` | `VARCHAR(20) NOT NULL DEFAULT 'INDUCTED'` | |
| `registration_number` | `VARCHAR(20)` | |
| `motor_number` | `VARCHAR(40)` | |
| `controller_number` | `VARCHAR(40)` | |
| `rfid_tag` | `VARCHAR(40)` | |
| `iot_number` | `VARCHAR(40)` | telematics unit, printed on the bike |
| `odometer_km` | `INTEGER` | |
| `inducted_on` | `DATE NOT NULL` | |
| `purchase_date` | `DATE` | |
| `created_on`, `updated_on` | `TIMESTAMPTZ NOT NULL` | |

```sql
CONSTRAINT chk_vehicle_state CHECK (state IN (
  'INDUCTED','READY_TO_DEPLOY','DEPLOYED','RETURNED','RECOVERY',
  'UNDER_REPAIR','QC_PENDING','ACCIDENT','RETIRED'));

CREATE UNIQUE INDEX idx_vehicles_registry ON vehicles (tenant_id, lower(registry_id));
CREATE UNIQUE INDEX idx_vehicles_chassis  ON vehicles (tenant_id, lower(chassis_number));
CREATE INDEX        idx_vehicles_state    ON vehicles (tenant_id, state);

SELECT enable_tenant_rls('vehicles');
```

Both unique indexes are on `lower(...)`, and both are queried through an
explicit `lower(...) = lower(:value)` — the S0 review found that Spring Data's
derived `...IgnoreCase` renders `UPPER(col) = UPPER(?)` and silently misses such
an index.

**Why a UUID key and not the registry id.** Every other table in this schema has
a UUID primary key, and a composite `(tenant_id, registry_id)` key would
propagate two columns into every child table — including the assignments table
Abhiram writes in S5. More importantly, a registry id mistyped at induction
would become uncorrectable the moment a service job referenced it. The API never
exposes the UUID: `GET /api/v1/vehicles/BLRSS0428` resolves the registry id and
404s if it does not exist.

**Why there is no `current_rider_id`.** `Vehicle.currentRiderId` in the contract
is a property of the open assignment, which S5 owns. Storing it on the vehicle
too would be two copies of one fact, and they would drift the first time an
assignment closed without the vehicle row being updated.

### `vehicle_lifecycle_events`

Append-only. Never updated, never deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID NOT NULL` | |
| `vehicle_id` | `UUID NOT NULL` → `vehicles` | |
| `from_state` | `VARCHAR(20)` | null on induction |
| `to_state` | `VARCHAR(20) NOT NULL` | |
| `note` | `TEXT` | |
| `actor_user_id` | `UUID` → `users` | |
| `actor_name` | `VARCHAR(120) NOT NULL` | frozen at write time |
| `occurred_on` | `TIMESTAMPTZ NOT NULL` | |

`actor_name` is stored rather than joined because users get renamed and a
history that rewrites itself is not a history. `actor_user_id` is kept alongside
it so the person can still be found.

Indexed on `(vehicle_id, occurred_on)` — the detail screen reads oldest first.
RLS enabled.

### `vehicle_imports` and `vehicle_import_rows`

`vehicle_imports`: `id`, `tenant_id`, `file_name`, `uploaded_by` → `users`,
`uploaded_on`, `committed_on`, `status` (`PENDING`, `COMMITTED`, `EXPIRED`).

`vehicle_import_rows`: `id`, `import_id` → `vehicle_imports`, `row_number`,
`payload JSONB`, `error TEXT` (null when the row will import cleanly).

Both RLS-enabled. A pending import older than 24 hours is `EXPIRED` and its rows
deleted; without a sweep, abandoned previews accumulate.

---

## API

All paths under `/api/v1/vehicles`. Every list is paginated. Every error is an
`ApiErrorResponse`.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/` | `PageResponse<VehicleResponse>` |
| `GET` | `/facets` | `Facet<VehicleState>[]` |
| `GET` | `/filter-options` | `{ makes, batteryTypes }` |
| `GET` | `/{registryId}` | `VehicleDetailResponse` |
| `POST` | `/` | `201 VehicleResponse` |
| `PUT` | `/{registryId}` | `VehicleDetailResponse` |
| `POST` | `/{registryId}/transitions` | `VehicleResponse` |
| `POST` | `/imports` | `BulkUploadPreview` (multipart) |
| `POST` | `/imports/{importId}/commit` | `{ imported }` |

**Query parameters on the list:** `page`, `size`, `q`, `state`, `hub`, `make`,
`batteryType`. `q` searches every column the row prints — registry id, chassis,
model, make, hub, battery type, battery vendor — because that is what a search
box appears to promise. Hub matters most: *"Koramangala"* is how a dispatcher
asks which bikes are at their yard.

**Facets** are counted over the search but never over the state filter.
Otherwise the chips fight the user: filtering to `DEPLOYED` would show
`DEPLOYED: 12` and every other chip at zero.

**Create** returns 409 with `field: "id"` on a duplicate registry id and
`field: "chassisNumber"` on a duplicate chassis, matching what the form already
reads. **Update** rejects identity fields — registry id, chassis number,
induction date — rather than silently ignoring them; `UpdateVehicleRequest`
already omits them, so sending one is a client bug worth surfacing.

**Transitions** take `{ toState, note }` and return 409 when the machine forbids
the edge, with a message naming both states in the words the UI uses.

### Roles

Shipped with this stage, not deferred to S3. `UserRole`, the `ROLE_*` authority
and `@EnableMethodSecurity` all landed in S0, so the machinery exists; S3 then
builds user management on a gate that already works rather than retrofitting one
across every endpoint written meanwhile.

| Endpoint | Roles |
|---|---|
| list, facets, filter-options, get | `SUPER_ADMIN`, `TENANT_ADMIN`, `FLEET_STAFF`, `SERVICE_MANAGER` |

`SERVICE_MANAGER` is on the read row because S4 is their stage and a service
queue that cannot read the vehicle it is servicing is unusable. Read access is
the loosest of the three rows deliberately: the cost of a wrong read inside one
tenant is low, and the cost of a fleet manager unable to see the fleet is not.
| create, update, imports | `SUPER_ADMIN`, `TENANT_ADMIN` |
| transitions | `SUPER_ADMIN`, `TENANT_ADMIN`, `SERVICE_MANAGER` |

The 403 these produce is correct only because of the `AccessDeniedException`
handler added to `GlobalExceptionHandler` in the S0 hardening pass — without it
a method-security denial falls into the catch-all and becomes a 500.

---

## The state machine

`VehicleStateMachine` is a plain class. No Spring, no database, no dependencies.
It holds the table above and answers two questions:

```java
boolean canTransition(VehicleState from, VehicleState to);
Set<VehicleState> allowedFrom(VehicleState state);
```

The rules live here and nowhere else, which is what makes the 81-pair test
possible in milliseconds without Docker.

### `transitionState()` — the only writer

```java
@Transactional
VehicleResponse transitionState(UUID vehicleId, VehicleState toState,
                                String note, UUID actorUserId);
```

1. `SELECT ... FOR UPDATE` on the vehicle row.
2. If `from == to`, return unchanged. No write, no event.
3. If `!machine.canTransition(from, to)`, throw `ConflictException`.
4. Update `vehicles.state`.
5. Append a `vehicle_lifecycle_events` row.

Nothing else in the codebase writes `vehicles.state` — not the REST layer, not
S4, not S5. Creating a vehicle is itself a transition, `null → INDUCTED`, which
is why `from_state` is nullable. Making this the only door is what stops the
lifecycle log from quietly going incomplete: a state change that is not logged
is not reachable.

**Why the row lock.** Exactly the defect class found in the S0 refresh-token
rotation: read, check, write, with nothing serialising the three. Two staff
transitioning one bike at once would both read `DEPLOYED`, both pass the check
and both write — two lifecycle rows for one real move, and the losing update
landing on top. S4 calls this method inside its own transaction, so the lock
also serialises service work against the registry.

The method is published to S4 through a narrow interface rather than the whole
service class, so the handshake `WORK_SPLIT.md` names is literally one method
wide.

---

## CSV import

Two calls, with the parsed batch staged server-side between them.

`POST /imports` takes the file as multipart, parses and validates every row, and
stores the batch with per-row errors. It returns the `BulkUploadPreview` the
screen already renders: file name, total rows, valid rows, error rows, and the
rows themselves.

This needs one field that the contract does not have yet. `BulkUploadPreview` in
`types/vehicle.ts` carries `fileName`, `totalRows`, `validRows`, `errorRows` and
`rows` — there is nowhere to put the `importId` the commit call needs, because
the mock had nothing to correlate. Adding `importId: string` to that interface is
part of this stage. `types/` is SMK-owned, so it is a one-field change rather
than a negotiation, but it is a contract change and belongs in the plan, not in
a commit nobody expected.

`POST /imports/{importId}/commit` inserts the valid rows and skips the errored
ones — the preview distinguishes `validRows` from `errorRows` and the commit
returns a count, so partial import is what the contract already describes.
Committing an import twice is a 409, not a second insert.

Staging costs a table and an expiry sweep. It buys the guarantee that what was
previewed is what gets imported, and a record of who imported what — a stateless
version would re-parse on commit with nothing tying the two calls together.

Each row creates a vehicle through the same path as `POST /`, so validation and
the `null → INDUCTED` transition cannot diverge between the two.

---

## Known compromises

Both are stated here rather than discovered later.

**`currentRiderId` and `currentRiderName` return null.** They are in the S1
contract but belong to the open assignment, which is S5 — Abhiram's stage. The
list screen shows an empty rider column until S5 lands. The alternative is
storing the rider on the vehicle, which is the duplication the schema section
rejects.

**`make` is derived, not sent.** `CreateVehicleRequest` has no `make` field; the
frontend's `deriveMake()` reads it off the model name prefix. The backend does
the same and stores the result, so one rule lives in two places until someone
gives us a real make list. For Ashok, with the three transition edges.

---

## Frontend change

`lib/api/vehicles.ts` currently also holds `recordInspection`, `listQcQueue`,
`decideQc`, `listInspectableVehicles` and `getVehicleServiceHistory` — all
service-module work that lands in S4. `WORK_SPLIT.md` promises that finishing a
backend stage changes exactly one frontend file, and that promise cannot hold
while one file spans two stages.

Before S1 lands, the five service functions move to `lib/api/inspections.ts`.
`vehicles.ts` then swaps whole at S1 and `inspections.ts` swaps whole at S4.
Screens change on their import lines only, and no component logic changes. One
type does: `BulkUploadPreview` gains `importId`, as above.

---

## Tests

Against a real Postgres, except the state machine, which needs none.

**`VehicleStateMachineTest`** — all 81 ordered pairs asserted in both
directions. `RETIRED` is terminal from every state. Every state no-ops to
itself.

**`VehicleCrudTest`** — create and read back by registry id; duplicate registry
id is 409 on `id`; duplicate chassis is 409 on `chassisNumber`; the same
registry id in two tenants both succeed; update cannot change registry id or
chassis; the list paginates, filters and finds a bike by its hub; facets count
over the search and not the state filter.

**`VehicleTransitionTest`** — a legal move updates the state and writes exactly
one event; an illegal move is 409 and writes nothing; two concurrent transitions
produce exactly one winner (this fails without `FOR UPDATE`, the same shape as
the refresh-token test); lifecycle reads oldest first; renaming a user does not
change the actor name on an old event.

**`VehicleImportTest`** — preview reports per-row errors and imports nothing;
commit imports the valid rows and skips the errored ones; committing twice is a
409; an import in one tenant is invisible to another.

**`VehicleRbacTest`** — `FLEET_STAFF` can list but cannot create or retire; no
token is 401; wrong role is 403.

Errors, all through `ApiErrorResponse`: 404 for no such vehicle, 409 for
duplicate identity or a forbidden transition, 422 for bean validation (first
field by name), 403 for the role gate, 401 for no token.

Every write path is `@Transactional`, per the rule written into
`backend/README.md`: `TenantFilter` commits the request transaction when a
business exception is answered by `GlobalExceptionHandler`, so a write path that
is not transactional will commit whatever it managed before it threw.
