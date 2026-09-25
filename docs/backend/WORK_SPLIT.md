# Who builds what

**SMK** and **Abhiram**. Part time, own timelines.

The full detail is in [`docs/BUILD.md`](../BUILD.md) and
[`SERVICE_MANAGEMENT.md`](./SERVICE_MANAGEMENT.md). This page is the short
version — what each person picks up, in plain words.

---

## The one rule

**One person owns a file. Never both.**

If you need something changed in the other person's file, ask for it. Do not
reach in and edit it. This is the whole reason the split below exists.

### Where that already slipped, and how it was settled

S0 was SMK's row. Abhiram built the auth half of it anyway, which was good work
and is now merged — but it means `auth/`, `config/`, `platform/` and `user/`
were all written by the person who does not own S3, and S3 lives in `user/`.

Settled: **S3 stays with SMK**, and the S0 files pass to SMK with it. Abhiram's
next file is `rider/` (S2) and nothing else. The lesson is not "Abhiram did the
wrong thing" — it is that the table above only works if you check it before you
start, not after you push.

---

## Backend

| Stage | What it is | Who | Can start once |
|---|---|---|---|
| **S0** | Boot the app, login, JWT, tenant isolation, database setup, Docker, CI | SMK (skeleton), **Abhiram** (auth) | **done** |
| **S1** | Bikes: create, edit, the nine states, CSV upload | **SMK** | **done** |
| **S2** | Riders: create, edit, KYC, hide most of the Aadhaar number | **Abhiram** | S0 |
| **S3** | Users and roles: who is allowed to call what | **SMK** | S0 |
| **S4** | Service jobs: intake, repair queues, QC, cost | **SMK** | **done** |
| **S5** | Assign a bike to a rider, exchange it, take it back | **Abhiram** | S4 |
| **S6** | Money: charges, weekly payment run, receipts, overdue | **SMK** | S4 |

### What runs at the same time

```
S0  (SMK)  ─ everything waits on this
     ├── S1 Bikes   (SMK)      ║  S2 Riders  (Abhiram)     ← together
     ├── S3 Users   (SMK)
     └── S4 Service (SMK)      ← needs bikes and riders first
          ├── S5 Assignments (Abhiram)  ║  S6 Money (SMK)  ← together
```

Abhiram is never blocked for long: **S2 starts the moment S0 lands**, and the
shell of S5 can be built while S4 is still in progress.

### Where the two of you actually meet

Three places, and only three:

| What | Built by | Used by | How it works |
|---|---|---|---|
| `ServiceJobFacade.openJob()` | SMK | Abhiram | Abhiram's deboard code calls this one method. He never opens the service module. |
| `ServiceJobClosedEvent` | SMK | SMK | A closed job tells the money module to charge the rider, in the background. |
| `VehicleService.transitionState()` | SMK | SMK | Service changes the bike's state through this, never by writing to the table. |

So the only real handshake between the two of you is **one Java method**:
`openJob()`. SMK writes it, Abhiram calls it. If its shape needs to change,
that is a conversation, not an edit.

---

## Frontend

Already built and running on mock data. Ownership stays as it is. Auth (S0)
is already live-capable: with `VITE_API_BASE` set, login, refresh, logout and
`/me` hit the API, the rail signs out behind a confirmation dialog, and every
login failure has its own message:

| Area | Owner |
|---|---|
| Shared everything — theme, layouts, shared components, router, session, mock API | **SMK** |
| `src/types/` — **the API contract** | **SMK** (Abhiram requests changes, does not edit) |
| Vehicles, inspection, QC, service, dashboard, operations, recovery, money, users, audit | **SMK** |
| Riders — list, detail, onboarding | **Abhiram** |
| Assignments — assign, exchange, deboard, settlement | **Abhiram** |

### Turning the mocks off

When a backend stage is finished, **one frontend file changes** and no screen
is touched:

| Backend done | File to swap | Who swaps it |
|---|---|---|
| S1 | `lib/api/vehicles.ts` | SMK |
| S2 | `lib/api/riders.ts` | Abhiram |
| S3 | `lib/api/users.ts` | SMK |
| S4 | `lib/api/serviceJobs.ts` | SMK |
| S5 | `lib/api/assignments.ts` | Abhiram |
| S6 | `lib/api/payments.ts` | SMK |

Whoever owns the backend stage owns the swap, because they are the one who
knows what the real response looks like.

S1's swap is already built — `lib/api/vehicles.ts` re-exports the live or the
mock implementation from `VITE_API_BASE`. The remaining rows follow the same
pattern.

---

## Right now

**Done:** S0 and S1. The backend boots, connects to Postgres, runs its
migrations, signs users in, rotates refresh tokens, refuses every request it has
no rule for, and proves tenant isolation in a test. On that floor sits the
complete vehicle module: create, edit, the nine states, search and facets, and
CSV bulk upload. 91 tests, all against a real Postgres. See
[`backend/README.md`](../../backend/README.md).

**S4 landed (2026-09-25):** the service module is built — `V006`, four
tables under RLS, the nine queues wired to `VehicleService.transitionState()`,
the QC gate, cost lines, close-with-liability and the async
`ServiceJobClosedEvent` the money module will listen for. `ServiceJobFacade.openJob()`
— the one handshake with Abhiram's S5 — is live and tested through the
interface. Backend 185/185 tests against a real Postgres, up from 111.

**S4's frontend swap is NOT done, and it is not a one-line change.**
`lib/api/serviceJobs.ts` cannot simply re-export a live twin, because the mock
`updateServiceJobRecord()` is doing three jobs the backend splits up: it
updates, it closes-and-charges when `queue === 'READY_TO_DEPLOY'`, and it
enforces rules that exist nowhere on the server — a note is required, a
technician and a work summary are required before QC or release, a claim
reference is required for WARRANTY/INSURANCE/PARTS_WAITING, a liability is
required once the total is non-zero, and the rider must exist before anything
is charged to them. Flipping the switch today would quietly drop all of that.
Either those rules move to the backend or `AssistanceJob.tsx` splits its one
save into update/close/QC calls. That is a decision, not a chore, so it is
written down rather than guessed at.

**RBAC go-live pass (2026-09-25):** the four product conflicts in
[`RBAC.md`](RBAC.md) are decided and implemented. Backend: vehicle create/import
gates now include FLEET_STAFF, and transitions run through
`VehicleTransitionPolicy` (FS fleet moves, SM workshop moves, SA/FA all incl.
retire; unknown pairs defer to the state machine for 409). Frontend: role
helpers in `roles.ts` updated, vehicle/service CTAs gated, AssistanceJob copy
fixed. Backend 111/111 tests, frontend 175/175 + lint + build green.

### What S0 actually is

Everything below exists and works today. There is no *fleet* logic in it yet —
that is the point. It is the floor the modules get built on.

**The project**

- Spring Boot 4.1.1 on Java 21, built with Maven. `./mvnw` is committed, so
  nobody has to install Maven — it fetches its own on first run.
- One package per module from the architecture doc: `auth`, `platform`,
  `vehicle`, `rider`, `user`, `service`, `assignment`, `payment`, `shared`,
  `notification`, `excel`. `auth`, `platform`, `user` and `vehicle` are filled
  in; the rest hold a short note saying what they own, which stage builds them
  and whose stage that is. Empty on purpose — the boundary exists before the
  code does, so nothing lands in the wrong module by accident.
- Flyway's auto-configuration comes from `spring-boot-flyway`, which is a
  separate dependency on Boot 4. Without it migrations silently do not run.
  Do not remove it.

**Shared plumbing every module will use**

- `PageResponse` — the paged shape every list returns. Matches `Page<T>` in
  `src/types/common.ts` exactly.
- `ApiErrorResponse` — the one error shape: message, status, and optionally the
  form field that failed. Matches what `lib/api/client.ts` already reads.
- `NotFoundException` (404), `ConflictException` (409), `ValidationException`
  (422) and one handler that turns them into that shape. Nothing anywhere else
  builds an error by hand.
- `Money` — rupees to paise and back, in one place.

**The database**

- Postgres 16, schema owned by Flyway. `V001__baseline.sql` creates `tenants`,
  `users` and `refresh_tokens`.
- Tenant isolation is done **by the database**, not by our code. Every request
  will set its tenant on the transaction, and Postgres will not return another
  tenant's rows even if a query forgets to filter. Adding it to a new table is
  one line: `SELECT enable_tenant_rls('table_name')`.
- Super admin reads across tenants through one explicit escape hatch, not by
  accident.
- The app connects as a normal database user, never a superuser — a superuser
  ignores all of the above silently.

**Security**

- Closed by default. The health check and the three auth URLs are open; every
  other path returns `401 {"message":"Not signed in"}`. A new endpoint added
  before its access rule is written refuses strangers rather than serving them.
- Passwords are BCrypt. CORS allows the Vite dev server.
- Login, refresh, logout, `/me` and the tenant filter are in. Refresh tokens
  rotate on use and are locked for update while they do, so one token cannot
  become two sessions. A revoked token presented again kills its whole chain.
- A disabled user or a suspended tenant cannot sign in **or refresh**, so a
  suspension takes effect within one access-token lifetime rather than one
  refresh-token lifetime.
- Two known gaps, both deliberate and both written down in `backend/README.md`:
  signing out does not invalidate the access token already issued (up to 15
  minutes), and login is not rate limited.

**Tests**

- Ninety-one, all green, run against a **real Postgres in Docker** — not an
  in-memory stand-in, which does not have row-level security and would prove
  nothing.
- One checks the app starts and the migrations ran. Four hammer tenant
  isolation: they query the users table with *no tenant filter at all* — the
  worst query anyone could write — and still must not see the other tenant's
  rows, must not be able to write into another tenant, and must see nothing when
  no tenant is set.
- Twelve walk the auth flow through the real filter chain. Five more cover the
  edges: a suspended tenant, an expired token, a signed token with an unusable
  claim, and two refreshes of the same token racing each other.
- The vehicle module adds its own: create, update, read, the nine-state
  transitions, the CSV import preview and commit, and the seed-file contract.

**Running it**

- `docker compose up -d` starts Postgres. `./mvnw spring-boot:run` runs the API.
- `docker compose --profile full up -d --build` also runs the API in a
  container, configured entirely from environment variables, the way a deployed
  one will be.
- CI runs `./mvnw verify` on every push, alongside the frontend job. Neither
  blocks the other.
- No mail server. Nothing sends mail until S6.

### What S1 actually is

The vehicle module, built on the S0 floor.

- `vehicle/` owns the registry: create, edit, read, the nine states and the
  transitions between them, search and facets, and CSV bulk upload (preview
  then commit).
- Every list is paginated through the shared `PageResponse`; every failure
  leaves through the shared error handler. Nothing in the module builds an
  error or a page by hand.
- The nine states are enforced in one place, `VehicleService.transitionState()`.
  S4 will change a bike's state through that same method — never by writing to
  the table.
- The seed fleet (`db/seed/fleet.csv`, 137 bikes) is generated from the
  frontend fixtures (`npm run seed:export`), so the wired screen and the mock
  screen show the same fleet.
- The frontend swap is built: `lib/api/vehicles.ts` re-exports the live or the
  mock implementation from `VITE_API_BASE`. It is the worked example every
  later module copies.

**SMK, next:** S6 — money, which S4 now unblocks. The one thing standing
between the service screens and the real API is not a backend gap: see
"Turning the mocks off" above and the note under S4 below.

**Abhiram, next:** S2 — riders: CRUD, KYC, masked Aadhaar. Unblocked now that
S0 is in. Read `frontend/app/src/types/rider.ts` first: that is the shape S2
has to return, and if something in it looks wrong, now is the cheap time to say
so.

**Deployment:** the path exists (`render.yaml`, `netlify.toml`, `DEPLOY.md`)
but is not live yet — the Render service is created but not running, and
`VITE_API_BASE` is not set as a GitHub variable. Until both happen the
deployed site stays the fixtures demo.

---

## Things that hold everywhere

- Every list is paginated. No endpoint returns everything.
- Money is paise (whole numbers) inside the system. Rupees only at the edge.
- Money rows and audit rows are never edited. A correction is a new row.
- A tenant's data is filtered by the database, not by your code.
- Never store a full Aadhaar number.
- Before you push: `./mvnw verify` on the backend, `npm run build` and
  `npm run lint` on the frontend.
- Say it before you pull. Both sides are live; a surprise rebase costs an hour.
