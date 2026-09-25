# RBAC — Page, Field & CTA Visibility (Go-Live Spec)

Status: implemented (backend gates + tests, frontend role helpers + CTA gates). Section 4 conflicts are decided — rulings below.
Sources: user stories (`reports/user-stories-by-role.md`), flow data (`frontend/app/src/pages/admin/flows/flowData.ts`), approved service design (`docs/backend/SERVICE_MANAGEMENT.md`), live backend gates, and frontend role helpers (`frontend/app/src/lib/roles.ts`).

Role abbreviations: **SA** Super Admin · **FA** Fleet Admin · **FS** Fleet Staff · **SM** Service Manager.

## 1. Page visibility

| Page | Route | SA | FA | FS | SM |
|---|---|---|---|---|---|
| Login | `/login` | public | public | public | public |
| Dashboard | `/dashboard` | ✓ | ✓ | ✓ | ✓ |
| Today's operations | `/operations/today` | ✓ | ✓ | ✓ | ✓ |
| Vehicles list | `/vehicles` | ✓ | ✓ | ✓ | ✓ |
| Vehicle detail | `/vehicles/:id` | ✓ | ✓ | ✓ | ✓ |
| Add vehicle | `/vehicles/new` | ✓ | ✓ | ✓* | ✗ |
| Edit vehicle | `/vehicles/:id/edit` | ✓ | ✓ | ✗ | ✗ |
| Bulk upload | `/vehicles/bulk-upload` | ✓ | ✓ | ✓* | ✗ |
| Bikes in service | `/service/queues` | ✓ | ✓ | ✓ | ✓ |
| QC queue | `/service/qc` | ✓ | ✓ | ✓ | ✓ |
| Inspection | `/service/inspection` | ✓ | ✓ | ✓ | ✓ |
| Help desk | `/service/assistance` (+`/new`, `/:jobId`) | ✓ | ✓ | ✓ | ✓ |
| Riders | `/riders` | ✓ | ✓ | ✓ | ✗ |
| Onboard rider | `/riders/onboard` | ✓ | ✓ | ✓ | ✗ |
| Rider detail | `/riders/:id` | ✓ | ✓ | ✓ | ✗ |
| Assign / Exchange / Deboard | `/assignments/*` | ✓ | ✓ | ✓ | ✗ |
| Weekly payment run | `/payments/run` (+`/:riderId`) | ✓ | ✓ | ✗ | ✗ |
| Overdue riders | `/payments/overdue` | ✓ | ✓ | ✗ | ✗ |
| Recovery board | `/recovery` | ✓ | ✓ | ✗ | ✗ |
| Users & roles | `/users` | ✓ | ✓ | ✗ | ✗ |
| Audit log | `/audit` | ✓ | ✓ | ✗ | ✗ |
| Design tokens / Flows | `/design-tokens`, `/flows` | dev tools — URL only, not gated | | | |

`✓*` = FS adds bikes (decided — conflict #1, §4).

Go-live rule: the frontend hides both sections **and** CTAs per role; the backend remains the final gate (routes are not hard-gated today).

## 2. Field visibility & CTAs per screen

### Fleet

**Vehicles list** — all four roles see every column (id, model, battery, hub, state, rider). No field hiding.

| Role | CTAs |
|---|---|
| SA, FA | Add vehicle · Bulk upload · row → detail |
| FS | Add vehicle* · Bulk upload* · row → detail |
| SM | row → detail only |

**Vehicle detail** — all four roles see specs, current rider, lifecycle timeline, service history (read-only).

| Role | CTAs |
|---|---|
| SA, FA | Edit · Transition (any) · Retire |
| FS | Transition — fleet moves only (assign, deboard, exchange, recovery) |
| SM | Transition — service moves only (QC pass/fail, repair queue moves) |

**Add / Edit vehicle** — fields: registry id, chassis, make, model, battery type/vendor, hub, inducted date. No sensitive fields.

| Role | Edits | CTA |
|---|---|---|
| SA, FA | all fields | Save |
| FS | all fields* | Save* |
| SM | — (page not reachable) | — |

**Bulk upload** — SA/FA (and FS*) see the parsed preview; only SA/FA (and FS*) get Upload + Commit.

### Service (all four roles read every field — jobs, cost items, events, QC history)

| Screen | Role | Edits | CTAs |
|---|---|---|---|
| Bikes in service / Help desk | SA, FA | everything | Open job · Update · **Close (decide liability)** |
| | FS | items, notes, queue | Open job · Update · **Close (decide liability)** |
| | SM | items, notes, queue | Open job · Update · **no Close** |
| QC queue | SA, FA, FS, SM | — | Pass / Fail (SM adds a fail reason) |
| Inspection | SA, FA, FS, SM | — | Record inspection (damage + next state) |

### Riders (SA, FA, FS — SM never sees this section)

| Screen | Role | Sees | Edits | CTAs |
|---|---|---|---|---|
| Riders list | SA, FA, FS | all columns; **Aadhaar masked for every role** | — | row → detail |
| Rider detail | SA, FA | identity, contact, commercial, vehicle, payment history | all | Edit · Assign · Exchange · Deboard |
| | FS | same (payment history read-only) | KYC/contact/commercial | Assign · Exchange · Deboard |
| Onboard rider | SA, FA, FS | all KYC fields | all | Save |
| Assign / Exchange | SA, FA, FS | all | all | Confirm |
| Deboard | SA, FA, FS | return condition, deposit, dues | all | Settle & close (money-touching — conflict #4) |

### Money (SA, FA only — FS and SM never see the section)

| Screen | Role | Sees | Edits | CTAs |
|---|---|---|---|---|
| Payment run | SA, FA | rider, rent, repair charges, total due, collected, outstanding | all | Record payment (full/partial) |
| Payment receipt | SA, FA | full breakdown | all | Record payment |
| Overdue riders | SA, FA | dunning stage, amounts | all | Send reminder · Escalate · Repossess |
| Recovery board | SA, FA | recovery queue | all | Track · Recover · Write off |

### Admin (SA, FA only)

**Users & roles** — both see all fields (name, email, role, status, last active, created).

| Role | Edits | CTAs |
|---|---|---|
| SA | name, email, **role (any, incl. SUPER_ADMIN)**, status | Edit · Invite |
| FA | name, email, **role (except SUPER_ADMIN — 403)**, status | Edit · Invite |

Self-edit rule for both: own name/email OK; **cannot disable self or change own role**. Invite is not built yet (S3 cut it) — go-live gap.

**Audit log** — read-only, all fields, filters, for SA/FA.

### Dashboard & Today's operations — all four roles, read-only, no field hiding, no CTAs.

## 3. The pattern

- **SA / FA** — everything (SA = platform-wide, FA = one fleet).
- **FS** — day-to-day bike work: reads everywhere, adds bikes, opens/updates/closes service jobs, runs the rider lifecycle. No money section, no admin.
- **SM** — the workshop: reads everything, opens/updates jobs, QC, inspections. No riders, no money, no admin, **cannot close a job** (can't decide who pays).

## 4. Conflicts — decided (implemented)

Four sources disagreed; all ruled per the recommendations below and implemented.

| # | Question | Says yes | Says no | Ruling (implemented) |
|---|---|---|---|---|
| 1 | Can FS add / bulk-upload vehicles? | User stories (FS-6, FS-7), flow data, `USER_ROLE_SCOPE` ("adding bikes") | Live backend + S1 spec (create/update/imports = SA/FA only) | **Yes** — FS adds bikes. Backend create + import gates now include FLEET_STAFF; frontend Add/Bulk CTAs gated by `canAddVehicle` (SA/FA/FS) |
| 2 | Who closes a service job? | Service doc + flow data: SA/FA/FS, **not SM** | `roles.ts canCloseServiceJob`: SA/FA/SM, **not FS** | **Follow the approved service doc** — FS closes, SM doesn't. `roles.ts canCloseServiceJob` = SA/FA/FS; AssistanceJob strings + tests updated |
| 3 | Can FS run vehicle transitions? | Flow data: FS does assign/deboard/exchange/recovery moves | Live backend: transitions = SA/FA/SM only | **Yes, with per-transition rules** — new `VehicleTransitionPolicy`: FS fleet moves, SM workshop moves (QC/repair routing — open to all four per flow data), SA/FA all incl. retire; unknown pairs defer to the state machine (409) |
| 4 | Does FS settle money at deboard? | User story FS-16 (settle deposit + dues) | Money section is admin-only everywhere else | **FS records the deboard, FA approves the settlement** — keeps "money = admin" intact. Design note only (S5 not built); no code change |

## 5. Go-live gaps this spec exposes

- Frontend routes are not hard-gated (any URL reachable) — hide sections + CTAs per role (done for CTAs; route guards still open).
- Invite-user flow not built (S3 cut it).
- Render backend not deployed (404, `x-render-routing: no-server`) — needs dashboard action.

Fixed as part of this work: `roles.ts canCloseServiceJob` now matches the approved service design (conflict #2); backend transitions gate now includes FS fleet moves + SM workshop moves via `VehicleTransitionPolicy` (conflict #3); vehicle create/import gates include FLEET_STAFF (conflict #1).