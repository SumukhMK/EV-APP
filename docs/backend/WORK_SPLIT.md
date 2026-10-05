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
| **S1** | Bikes: create, edit, the nine states, Excel/CSV upload | **SMK** | **done** |
| **S2** | Riders: onboard, list, read, KYC flags, Aadhaar encrypted at rest | **Abhiram** | **done** |
| **S3** | Users and roles: who is allowed to call what | **SMK** | **done** |
| **S4** | Service jobs: intake, repair queues, QC, cost | **SMK** | **done** |
| **S5** | Assign a bike to a rider, exchange it, take it back | **Abhiram** | **done** |
| **S6** | Money: charges, weekly payment run, receipts, overdue | **SMK** | **done** |

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

Four places, and only four:

| What | Built by | Used by | How it works |
|---|---|---|---|
| `ServiceJobFacade.openJob()` | SMK | Abhiram | Abhiram's deboard code calls this one method. He never opens the service module. |
| `ServiceJobClosedEvent` | SMK | SMK | A closed job tells the money module to charge the rider, in the background. |
| `VehicleService.transitionState()` | SMK | SMK | Service changes the bike's state through this, never by writing to the table. |
| `AssignmentQuery` (S6 → S5) | declared by SMK in `payment/` | implemented by Abhiram in `assignment/` | The payment run asks "which bike was this rider on during this week, and for how many days?" S5 answers. |

So the only real handshake between the two of you is **one Java method**:
`openJob()`. SMK writes it, Abhiram calls it. If its shape needs to change,
that is a conversation, not an edit.

`AssignmentQuery` is the one place the direction runs the other way. With
`openJob()`, SMK publishes a method and Abhiram calls it. With
`AssignmentQuery`, SMK declares an interface he needs and Abhiram supplies the
implementation. **This is still open after the merge:** S5 landed its own
`com.evrental.assignment.AssignmentQuery` (the rider/vehicle reads), which is
a different interface from the `com.evrental.payment.AssignmentQuery` the run
needs — so `NoAssignmentsYet` still answers `Optional.empty()` for every
rider, and the run bills a full week against a bike it cannot name. The
follow-up: implement `com.evrental.payment.AssignmentQuery` in `assignment/`
(or a small bridge bean) and annotate it `@Primary` so it wins the injection
point; nothing in `payment/` needs to change on that day.

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

| Backend done | File to swap | Who swaps it | Status |
|---|---|---|---|
| S1 | `lib/api/vehicles.ts` | SMK | ✅ built — re-exports live or mock from `VITE_API_BASE` |
| S2 | `lib/api/riders.ts` | Abhiram | ✅ built — split into `riders.mock.ts` / `riders.live.ts` |
| S3 | `lib/api/users.ts` | SMK | ✅ built — can go live |
| S4 | `lib/api/serviceJobs.ts` | SMK | ✅ built — split into `serviceJobs.mock.ts` / `serviceJobs.live.ts` |
| S5 | `lib/api/assignments.ts` | Abhiram | ✅ built — split into `assignments.mock.ts` / `assignments.live.ts` |
| S6 | `lib/api/payments.ts` | SMK | ✅ built — split into `payments.mock.ts` / `payments.live.ts` |

Whoever owns the backend stage owns the swap, because they are the one who
knows what the real response looks like.

All six modules are swapped (2026-09-30). `lib/api/inspections.ts` — split
out of `vehicles.ts` at S4 but not its own row above, since it was never
listed as one — is also live for the two functions a real screen calls
(`getVehicleServiceHistory`, `listInspectableVehicles`); its other three
exports (`recordInspection`, `listQcQueue`, `decideQc`) have no backend
endpoint and stay on the mock permanently, same as `lib/api/audit.ts`, which
has no backend at all.

---

## Right now

**Done:** S0 through S6. The backend boots, connects to Postgres, runs its
migrations, signs users in, rotates refresh tokens, refuses every request it has
no rule for, and proves tenant isolation in a test. On that floor sit the
complete vehicle module (create, edit, the nine states, search and facets, CSV
bulk upload), the rider register (onboard, KYC flags, Aadhaar encrypted at
rest), users and roles, the service module (intake, repair queues, QC, cost)
and the assignment module (assign, exchange, deboard, settlement facts). S6's
first half — the charge ledger — is built too. 290 tests, all against a real
Postgres. See [`backend/README.md`](../../backend/README.md).

**S4 landed (2026-09-25):** the service module is built — `V006`, four
tables under RLS, the nine queues wired to `VehicleService.transitionState()`,
the QC gate, cost lines, close-with-liability and the async
`ServiceJobClosedEvent` the money module will listen for. `ServiceJobFacade.openJob()`
— the one handshake with Abhiram's S5 — is live and tested through the
interface. Backend 185/185 tests against a real Postgres, up from 111.

**S4's frontend swap landed (2026-09-30).** `serviceJobs.ts` is now split into
`serviceJobs.mock.ts` / `serviceJobs.live.ts`. The release path's five things:

1. closes the job — the backend does this;
2. moves the bike — the backend does this;
3. `addRiderCharge(...)` — done: `close()` raises `ServiceJobClosedEvent`, which the money module turns into a charge;
4. `rider.depositHeld -= total` — done: the register stores `depositHeld` and draws it down on that event;
5. clears `vehicle.currentRiderId` — done: the assignment row is the source of truth.

`serviceJobs.live.ts`'s `updateServiceJob` does the one bit of real
orchestration: the mock's `updateServiceJobRecord` is one function that can
save, submit QC and close together, but the API is three RBAC-gated
endpoints (`PUT /jobs/{id}`, `POST /jobs/{id}/qc`, `POST /jobs/{id}/close}`).
`updateServiceJob` reads the same request `AssistanceJob.tsx` already sends
(`qcChecks` present and the target queue not QC_PENDING) and sequences the
real calls itself, so the screen needed no change.

The nine QC checks now reach the API from the screen: `UpdateServiceJobRequest`
carries an optional `qcChecks` map, sent while the job is in QC_PENDING,
matching `QcChecks.REQUIRED` field for field (2026-09-29).

What *was* portable has been done: the rules that only existed in the mock now
live on the API (see below), because `ServiceJobFacade` is what Abhiram's S5
deboard calls, and it was enforcing none of them.

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
  `notification`, `excel`. `auth`, `platform`, `user`, `vehicle`, `rider`,
  `service`, `assignment` and the first half of `payment` are filled in; the
  rest hold a short note saying what they own, which stage builds them and
  whose stage that is. Empty on purpose — the boundary exists before the code
  does, so nothing lands in the wrong module by accident.
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

- Three hundred and twenty-nine, all green, run against a **real Postgres in
  Docker** — not an in-memory stand-in, which does not have row-level security
  and would prove nothing.
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
  transitions between them, search and facets, and Excel/CSV bulk upload
  (preview then commit).
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

**S6, first half (2026-09-26):** the charge ledger is built. `V007` adds
`rider_charges`; a service job that closes against a rider raises one through
an async listener on `ServiceJobClosedEvent`, guarded against double-billing by
a unique index on the job id. Read and settle endpoints are Money-gated
(SA/FA). 211/211 backend tests; 250/250 once S2 landed the same day.

**S2 landed (2026-09-26):** the rider register is built — `V008` adds the
`riders` table under RLS and the two FKs V006/V007 left off; onboard, list,
read, facets, assignable and the payment-history seam are live, gated
SA/FA/FS; the ten designed riders are seeded. The Aadhaar is stored encrypted
at rest (`AadhaarCipher`, AES-256-GCM, key from `AADHAAR_ENCRYPTION_KEY`) and
never returned by the API. Backend 250/250 tests against a real Postgres, up
from 211.

**S6's second half landed (2026-09-29).** The weekly payment run, the overdue
list and receipts each needed four things that only exist on a rider: the name
and phone to chase, the weekly rent (`planAmount`), the billing day (Monday or
Wednesday — it decides who is in this week's run at all) and the deposit
balance (`depositHeld`, which a DEPOSIT charge draws down). All four were on
the register once S2 landed; the run, the overdue list and the receipts are
built now. One item from S5's landing is still open: the **settlement
approval** — an FA approves a deboard's recorded settlement facts
(`outstandingRent`, `depositRefund`), and the approval writes the ledger rows.
Until then the facts sit on the assignment row, deliberately unspent.

`rider_charges.rider_id` now carries the foreign key V008 added — a charge
names a real rider. There is still deliberately no `period_start` column:
which billing period a charge first appears against depends on the rider's
billing day, so storing a guess now would be a number the run later has to
disagree with.

**S5 landed (2026-09-28):** the assignment module is built — `V009` adds the
`assignments` table under RLS, with the period invariant as a CHECK, "one
rider, one bike" as partial unique indexes, and the settlement figures as
facts on the closing row; assign, exchange and deboard are live, gated
SA/FA/FS; the rider and vehicle reads now answer `currentVehicleId` /
`currentRiderId`, and the vehicle detail carries the assignment history; the
ten designed assignments are seeded. The deboard path calls
`ServiceJobFacade.openJob()` — the one handshake with SMK's service module —
so a returned bike goes where its damage category routes it. Backend 290/290
tests against a real Postgres, up from 250.

**S6 landed complete (2026-09-29):** the weekly payment run, the overdue list
and receipts joined the charge ledger. `lib/api/payments.ts` is swapped —
split into `payments.mock.ts` and `payments.live.ts` behind `VITE_API_BASE`,
the same shape `vehicles.ts` already uses — so `getCurrentPaymentRun`,
`listOverdueRiders`, `getPaymentReceipt` and `recordPayment` hit the real API
in a live build with no screen change. Money's row in the swap table is done.

Also done: the QC checklist can now reach the API. `UpdateServiceJobRequest`
carries an optional `qcChecks` map, and `AssistanceJob.tsx` sends it while the
job is in QC_PENDING — matching `QcChecks.REQUIRED` on the API field for
field.

**All six modules' frontend swaps are done (2026-09-30):** `serviceJobs.ts`,
`riders.ts`, `assignments.ts` and `inspections.ts` (partial — see the swap
table above) joined `vehicles.ts`, `users.ts` and `payments.ts`. Every
`lib/api/*.ts` file now re-exports live or mock from `VITE_API_BASE`, except
`lib/api/audit.ts`, which has no backend endpoint at all and stays mock-only.

**Still open, Abhiram's:** implement `com.evrental.payment.AssignmentQuery`
in `assignment/` (annotated `@Primary`) so the payment run can name the bike a
rider held and bill only the days they held it — `NoAssignmentsYet` still
answers empty, so every run row bills a full week against no bike.

**Deployment is live (2026-10-02).** Both repository variables are set
(`RENDER_SERVICE_ID`, `VITE_API_BASE`), the Render service serves at
`https://evrental-api.onrender.com`, and the Netlify site is wired to it. The
seven swapped modules now read the real database on the deployed site.

Two things about it are worth knowing before debugging a "broken" deploy:

- **The first request after an idle period takes ~20 seconds.** Render sleeps
  the instance and Neon scales to zero, so the first call wakes both. It is
  not a hang; the second call is sub-second.
- **A deploy failure shows as a green CI run with a red `Deploy API` job.**
  The site deploys from a separate lane and stays up on the old bundle, so
  the symptom is an API that times out while the site looks fine.

**The V009 collision (2026-09-29 to 10-02), because it will happen again.**
Two branches each added a `V009`: the payment run merged first and deployed,
then the backend-dev merge brought in `V009__assignments.sql` and renumbered
payment to `V010`. Production had therefore run the payment script *as*
version 9, and `flyway.repair()` — added that evening to silence the checksum
error — relabelled that row as the assignments migration without running it.
The database then held the complete payment schema under the wrong number and
no `assignments` table at all. `V010` and `V011` are both written to be
re-runnable for exactly that reason, and `MigrationRecoveryTest` reproduces
the production history in a container so it cannot silently return.

The lesson for the table above: **check the migration directory for the next
free number at merge time, not when you start the branch.** Two people on
part-time schedules will pick the same number otherwise.

**The bulk upload accepts Excel (2026-10-02).** The screen had advertised
`.xlsx` since S1 while the parser only read CSV, so every Excel upload was
read as UTF-8 text and rejected with a message about a missing column. The
API now reads real workbooks (`poi-ooxml`), sniffing the ZIP signature rather
than trusting the extension, and handles the two things a real export does
that a hand-written fixture does not: a date cell holds a serial number, and
a registry id Excel decided was numeric loses its formatting.

`GET /vehicles/imports/template` returns a formatted `.xlsx` to fill in,
generated per request from the same header list the parser reads so the two
cannot drift. The upload screen gained a **Download template** button and lost
three claims that were not true: a "Map columns" stage that existed on neither
side, a column list naming fields the importer has never accepted, and a note
saying header names need not match exactly. At the time, they had to.

**Hardening (import-hardening branch).** The first real file from a hub was
rejected, and the screen showed the previous file's preview under the error.
Parsing is now three tested units in front of the service: `ImportFileReader`
(bytes → rows of text; `.xlsx`, `.xls` and CSV by content, BOM and UTF-16
and Windows-1252 CSVs, delimiter sniffed, first visible non-empty sheet,
readable messages for a PDF, a password-protected workbook or a ZIP that is
not one), `HeaderMatcher` (finds the header among up to ten title rows,
matches names loosely — case, spaces, punctuation, a short alias table so
"Chassis Number" and "Reg No" work — and reports every missing column at once
with the columns it found, as `details` on the 422), and `ImportDates`
(day-first `01/09/2026`, dashes, dots, month names, midnight timestamps; a
future date is a row error). The service caps a file at 2,000 rows, refuses
to commit a preview older than 24 hours even before the nightly sweep, and the
preview names the sheet it read and the columns it ignored. A file over the
multipart limit is a 413 sentence, not a 500. CSV goes through Commons CSV;
the hand-written parser is gone.

**Bounded memory (same branch, after a soak).** Running the jar at Render's
heap (384 MB) and uploading adversarial files found that a 4.5 MB workbook
of 16,384 columns killed the JVM in 1.5 s: POI's object model held 1.6
million cells before the row cap was checked. The .xlsx path is now a SAX
stream from a spooled temp file (`OPCPackage.open(File)` — the InputStream
form buffers every entry in memory), stopping at the row cap, keeping 256
columns, cutting cells at 1,000 characters, with a total-text budget and a
shared-strings budget; .xls is size-capped at 512 KB; CSV streams and stops
at the cap; two files parse at a time (503 past that); POI's zip-bomb ratio
is off because the budgets bound memory and the entry-size cap bounds time.
`-XX:+ExitOnOutOfMemoryError` is on the container so any future OOM restarts
cleanly instead of limping. Every rejection logs POI's reason at WARN.
V015's backfill also gained the `set_config('app.tenant_id','*')` line it
was missing — under FORCE ROW LEVEL SECURITY it updated zero rows on any
database that already had riders (production's role bypasses RLS, so only
developers saw it).

**QA pass (2026-10-04).** Every section driven end to end in a headless
browser against the local stack, as the fleet admin. Found and fixed: the
service module still spoke rider UUIDs after riders got codes — opening a
help-desk job for a bike with a rider was a 400, and the job screen printed
a UUID that linked to a 404 (`CreateServiceJobRequest.riderId` and
`ServiceJobResponse.riderId` are now the code, with `riderName` alongside);
the vehicle search did not match the current rider's name or code though
the box promised it; the rider detail kept saying "KYC pending" after a
decision (list key invalidated, detail key not); the onboarding platform
box started as "Other" and appended what was typed ("OtherZomato"); the
add-vehicle date accepted "0109-20-26" and surfaced the API's generic 400;
the hub and model pickers read constants from `src/mocks/seed` instead of
`/reference/form-options`. Open, not fixed here: nothing in the UI calls
`GET/POST /assignments/settlements…`, so a deboard's deposit refund can
never be approved from a screen; KYC decisions and rider onboarding are not
in the audit trail (ChangeLog records plan and role changes only); a
DEPLOYED bike with no open assignment
(87 of the seeded 97) has no way back except through inspection.

**QA pass, round two (2026-10-05).** Sumukh's own test found what the first
pass missed: a freshly onboarded bike could not be checked in at all —
`INDUCTED → QC_PENDING` was not an edge in the state machine, and the
inspection screen's only "no damage" route is the QC queue ("A vehicle that
is Onboarding cannot become Quality Check"). The edge is in now, WORKSHOP
roles, with the machine table and an end-to-end test. A probe of every
endpoint with payloads a screen would never send then found the server
rules the forms had been standing in for: the chassis number is a
17-character VIN everywhere now (create, import row, template examples) —
the API had accepted anything up to the column width, so a short one from
a spreadsheet was stored; the registry id is upper-cased on the way in; an
induction date or an assignment start date in the future is a 422 on its
field. Left as designed: `vehicles.hub` and `model` stay free text (V013
says the reference tables are "the list offered, not a foreign key"), and
`batteryType` stays free text for the import.

**QA pass, round three (2026-10-05), against
`reports/user-stories-common-sense.md`.** Six user stories (bike onboarding
→ QC → deploy, rider onboarding + assignment, exchange, deboard, payments,
workshop QC) plus the cross-cutting checklist, each step probed with the
valid case and every listed invalid one. Fixed: the registry id is letters
and digits only and the registration number letters/digits/space/hyphen
(create and import row); the weekly plan is bounded on both sides, more than
zero and at most ₹25,000, on onboarding and on a plan change; PAN and
driving licence have a shape when given (blank still means "not given");
an exchange or a return cannot be dated before the assignment began or in
the future; a deposit refund larger than the deposit held is refused at the
desk rather than clamped on approval; a failed QC sheet must say what
failed; the QC decision is timestamped in the response. Verified already
right: contradiction rules (NONE with parts, MAJOR with none), retired bikes
cannot be assigned, two desks assigning the same bike or rider at once lose
to the partial unique indexes, QC on a bike that is not at the bench is a
409, ACCIDENT cannot jump to DEPLOYED, negative costs and amounts are 422s,
every role denial is a 403. Left as designed: overpayment is accepted and
the balance goes negative (it is a credit, and the test says so), and a
PAID line can still take money for the same reason. Still open: duplicate
Aadhaar is not detected — the number is encrypted with a random IV, so
detection needs a keyed-hash column (V017, `aadhaar_hash` + unique index).

**No internal ids on screen (2026-10-05).** Service jobs were the last
record a screen named by its database id — the help desk rows, the
vehicle's work-record list, the job header and every job URL. V016 gives
them `job_code` ("J01", "J02"…, one sequence per tenant) in the shape V015
gave riders: a row-locked counter so a rolled-back open puts its number
back, a backfill oldest-first under the RLS bypass, a unique index on
`lower(job_code)`. The API's `id` is the code; `/service/jobs/{id}` and the
QC endpoints resolve a code (case-insensitive) or, for an old ledger row, a
UUID. `RiderChargeResponse.serviceJobId` is the code too. Still carrying a
UUID, deliberately: `SettlementResponse.assignmentId` (no screen reads it)
and `UserResponse.id` (a row key, never shown). The crawl that found this
— every screen, rendered text scanned for a UUID — is the check to repeat
after any new list or detail screen.

**A clean first check closes itself (2026-10-05).** Found by running the
stories through the real screens on a fresh tenant: a new bike's first
check passed QC, the bike was assigned, and the exchange was refused with
"already has an open service job". Closing a job is a money decision, so a
passed inspection stayed open forever and blocked every later return. A
passed check with no damage and no cost now closes on QC pass (liability
COMPANY, "nothing to bill"); a repair still waits for the fleet to say who
pays, and the refusal names the job and says what to do. Every 500 carries
a short reference that the server log line also carries, because the
Render log is readable by one person.
V017 closes the clean checks that had already passed before the rule
existed (with a line in each job's activity log), so the fix holds for
every bike already in the fleet, not only the next one.

**Deboarded is "done with that bike", not gone (2026-10-05, Sumukh).**
Three rules on assign, in `AssignmentService.assign`: a deboarded rider is
on the assign list and the assignment puts them back on the register in the
same transaction; dues (unpaid rent plus open charges, `duesPaise` on every
rider response, `RiderPaymentStatusQuery.owedPaiseFor`) never reset and are
shown and confirmed rather than blocking; and the deposit is the limit — a
rider who owes more than the deposit held does not get a bike unless a
fleet admin or super admin sends `overrideDues` with a note, which the
lifecycle line records word for word. Suspended and blacklisted riders are
decisions about a person and stay off the list. The explicit "Put back on
register" stays for a desk that wants a rider active without a bike yet.
The query client now refetches on mount and on focus with five seconds of
freshness, so a screen shows what the database holds when you arrive at it.

**A held bike goes back to its rider; a return while in the workshop lands
on the open job (2026-10-05).** "Check this bike" on a bike its rider still
holds, QC pass: the bike went to READY_TO_DEPLOY with the assignment still
open, and "End assignment" from the job page was refused because the bike
already had an open job. Now `ServiceJobService.releaseTarget` sends a
released bike to DEPLOYED when somebody holds it (new edge QC_PENDING →
DEPLOYED, WORKSHOP roles) and to READY_TO_DEPLOY otherwise; and
`AssignmentService.returnToWorkshop` writes an exchange or deboard return
on the bike's open job (`ServiceJobFacade.recordReturnOnOpenJob`) instead
of opening a second one, leaving the bike where the workshop has it. The
job screen has no "save progress" or "save my notes" any more: every save
moves the bike somewhere, and the button says "Pick what to do" until the
operator has picked which. Screens reached from a record (job, bike,
rider) carry `state.returnTo` and go back there on Cancel and after a
save (`useReturnTo`).

**Two rider statuses (2026-10-05, Sumukh).** ACTIVE is holding a bike;
INACTIVE is on the register without one — freshly onboarded or deboarded
alike. Seven statuses had grown on the column and two of them were the same
fact; "Put back on register" existed only to move between them. V018 drops
the other values and recomputes every rider from the open assignments;
`RiderResponse` derives the status from the open assignment so the wire
cannot disagree with the assignments table; the assign flow writes ACTIVE,
the deboard flow writes INACTIVE, nothing else writes it; the reactivate
endpoint and button are gone. Suspension and blacklisting are not statuses
any more — when the business needs them they are decisions about a person
and belong in their own place, not in the word that says whether a rider
has a bike.

**Validation is server-side and stays there.** The endpoint is reachable
without the UI, and the duplicate checks need the database. The frontend's
job is to render the per-row errors the preview returns.

---

## Still to build

In rough order of what it costs the product:

| What | Who | Why it matters |
|---|---|---|
| `com.evrental.payment.AssignmentQuery` in `assignment/`, `@Primary` | **Abhiram** | `NoAssignmentsYet` still answers empty, so every run row bills a full week against a bike it cannot name. This is wrong money, not a missing screen. |
| Settlement approval | **Abhiram → SMK** | A deboard's `outstandingRent` / `depositRefund` sit on the assignment row with no endpoint to approve them into ledger rows. |
| The dashboard's backend | **SMK** | See below. |
| The deposit ceiling (`total > rider.depositHeld`) | **SMK** | Still mock-only; `ServiceJobFacade` does not enforce it, and that is what S5's deboard calls. |

### The dashboard is not swapped, and was never in the swap table

`lib/api/dashboard.ts` has **no `.live.ts` sibling and no `IS_LIVE` check** —
it imports `mocks/dashboard` directly, so every tile on `/dashboard`,
`/operations/today` and `/recovery` shows fixture data *even in a live build*.
This is not a module that was missed in the 2026-09-30 sweep; it was never one
of the six, because it never had a live/mock pair to switch between.

What those numbers actually are today:

- the eight KPI tiles — `vehicles.filter(...).length` over the fixture fleet;
- the deployments chart — a hardcoded 13-element array, with a hardcoded
  "Aug 2025 — Aug 2026" subtitle;
- Today's Operations' movement and outcome strips — derived from an FNV hash
  of the date string, so they change daily and mean nothing;
- the recovery board — `inRecovery * 0.4` and `* 0.2`, ratios invented in the
  frontend.

**There is no backend for any of it.** No `/dashboard`, `/metrics`, `/summary`
or `/stats` path exists in any of the twelve controllers. One aggregate *was*
built and is unconsumed: `GET /service/queues/counts`.

The cheap half needs no new endpoint — `GET /vehicles/facets` already returns
per-state counts and `GET /payments/overdue` the overdue list, which between
them cover all eight tiles. The charts and the operations strips need real
endpoints. `recoveryCounts`' `leftAtRoadside` / `missing` have no backing
state in the registry at all and need a vehicle sub-state before they can be
anything but invented.

---

## Things that hold everywhere

- Every list is paginated. No endpoint returns everything.
- Money is paise (whole numbers) inside the system. Rupees only at the edge.
- Money rows and audit rows are never edited. A correction is a new row.
- A tenant's data is filtered by the database, not by your code.
- Never store a full Aadhaar number in the clear — encrypt at rest
  (`AadhaarCipher`, key from `AADHAAR_ENCRYPTION_KEY`), never return it on the
  wire.
- Before you push: `./mvnw verify` on the backend, `npm run build` and
  `npm run lint` on the frontend.
- Say it before you pull. Both sides are live; a surprise rebase costs an hour.

---

## Service rules moved from the mock to the API (2026-09-26)

`mocks/serviceJobs.ts` enforced rules the API did not, which meant the screens
had them and `ServiceJobFacade` — the method Abhiram's S5 deboard code calls —
did not. Moved to `ServiceJobService`, keeping the mock's own wording so a
screen that already prints a message keeps printing the same sentence:

| Rule | Field | When |
|---|---|---|
| "Write what you found, or why you are making this change" | `note` | every save |
| "Add the claim number, or say which parts you are waiting for" | `reference` | WARRANTY, INSURANCE, PARTS_WAITING |
| "Say who did the work before QC or before the bike goes back out" | `technician` | moving to QC_PENDING or READY_TO_DEPLOY |
| "Write what you did, or say that no repair was needed, …" | `workSummary` | moving to QC_PENDING or READY_TO_DEPLOY |
| "No rider is on this bike, so the company has to cover the cost." | `liability` | closing as RIDER or DEPOSIT |

All 422s with the field attached, which the forms already read.

Not moved yet: the deposit ceiling (`total > rider.depositHeld`). S2 landed
2026-09-26 — the register stores `depositHeld`, and the FK V008 added
(`fk_service_jobs_rider`) enforces the "rider record must exist" guard at the
database — but the ceiling check itself is still mock-only.
