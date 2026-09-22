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

---

## Backend

| Stage | What it is | Who | Can start once |
|---|---|---|---|
| **S0** | Boot the app, login, JWT, tenant isolation, database setup, Docker, CI | **SMK** | now — *skeleton done, auth next* |
| **S1** | Bikes: create, edit, the nine states, CSV upload | **SMK** | S0 |
| **S2** | Riders: create, edit, KYC, hide most of the Aadhaar number | **Abhiram** | S0 |
| **S3** | Users and roles: who is allowed to call what | **SMK** | S0 |
| **S4** | Service jobs: intake, repair queues, QC, cost | **SMK** | S1 + S2 |
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

Already built and running on mock data. Ownership stays as it is:

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

---

## Right now

**Done:** the backend skeleton. It boots, connects to Postgres, runs its
migration, refuses every request it has no rule for, and proves tenant
isolation in a test. See [`backend/README.md`](../../backend/README.md).

### What the skeleton actually is

Everything below exists and works today. There is no business logic in it yet —
that is the point. It is the floor the modules get built on.

**The project**

- Spring Boot 3.3.5 on Java 21, built with Maven. `./mvnw` is committed, so
  nobody has to install Maven — it fetches its own on first run.
- One empty package per module from the architecture doc: `auth`, `platform`,
  `vehicle`, `rider`, `user`, `service`, `assignment`, `payment`, `shared`,
  `notification`, `excel`. Each holds a short note saying what it owns, which
  stage builds it and whose stage that is. Empty on purpose — the boundary
  exists before the code does, so nothing lands in the wrong module by accident.

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

- Closed by default. The health check and the two login URLs are open; every
  other path returns `401 {"message":"Not signed in"}`. A new endpoint added
  before its access rule is written refuses strangers rather than serving them.
- Passwords will be BCrypt. CORS allows the Vite dev server.
- The actual login, tokens and tenant filter are the next piece of work.

**Tests**

- Five, all green, run against a **real Postgres in Docker** — not an in-memory
  stand-in, which does not have row-level security and would prove nothing.
- One checks the app starts and the migration ran. Four hammer tenant isolation:
  they query the users table with *no tenant filter at all* — the worst query
  anyone could write — and still must not see the other tenant's rows, must not
  be able to write into another tenant, and must see nothing when no tenant is
  set.

**Running it**

- `docker compose up -d` starts Postgres. `./mvnw spring-boot:run` runs the API.
- `docker compose --profile full up -d --build` also runs the API in a
  container, configured entirely from environment variables, the way a deployed
  one will be.
- CI runs `./mvnw verify` on every push, alongside the frontend job. Neither
  blocks the other.
- No mail server. Nothing sends mail until S6.

**SMK, next:** finish S0 — login, refresh, `/me`, the filter that sets the
tenant on every request, a first admin user to log in as.

**Abhiram, next:** nothing to start until S0 lands. Worth reading in the
meantime: `frontend/app/src/types/rider.ts` and `assignment.ts` — those are the
shapes S2 and S5 have to return, and if something in them looks wrong, now is
the cheap time to say so.

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
