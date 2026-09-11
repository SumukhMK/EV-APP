# BUILD.md — EV Rental Platform

Team: **SMK** and **Abhiram**. Part time, own timelines.
Stack locked: **Spring Boot + React/Vite + PostgreSQL** (Flyway, Redis, RabbitMQ, Docker).

> Rewritten Sep 2026. The previous version had drifted from the code in two ways
> that mattered: it described a **Mon→Mon week with Thursday due**, when the app
> has run a **Wed→Tue** billing week since `5988a44`; and it listed payments,
> users and the audit log as unassigned when all three are built and owned. Both
> corrected below. Treat this file as the plan of record — if it disagrees with
> the code again, the code wins and this gets fixed the same day.

---

## What we are building

A web platform to run electric-bike rental fleets. Three levels of users:

- **Super Admin** — the platform owner. Sees all tenants, bikes, riders. Manages
  tenants, their subscription plans, platform alerts, and the shared blacklist.
- **Tenant Admin** — a fleet company (like Ashok). Runs their own fleet: bikes,
  riders, rent, service, dashboards. Cannot see other tenants.
- **Rider** — rents a bike, pays weekly rent, raises service tickets. (Later phase.)

Plus a service/field-engineer side and notifications (SMS now, WhatsApp later).

---

## Where we actually are

**The Phase 1 UI is built and runs end to end against fixtures.** Every screen in
`docs/PHASE1_UI_PLAN.md` exists: dashboard, today's operations, vehicle registry,
add/bulk-upload/detail, inspection, QC, service, riders, onboarding, assign,
exchange, deboard, payment run, receipts, overdue, recovery, users, audit log.

Also landed since that plan was written:

- **Two schemes** — Nocturne Night (navy/purple/grey) and Saffron Day (white with
  orange, green, yellow), switched from a toggle top-right and remembered. Tokens
  resolve to CSS custom properties, so one attribute on `<html>` repaints the app.
- **An intensity scale** (`high / mid / low / risk`) driving hub utilisation, with
  bands derived from the figure so a bar and its label cannot disagree.
- **A collapsible rail**, open by default, 232 ↔ 64px, animated, reduced-motion aware.
- **`/design-tokens`** — every ramp, tone, band and control on one unlinked page.

**What none of it has: a safety net.** There are zero tests, no test tooling in
`package.json`, and no CI. Every check so far — contrast, band coverage, fleet
totals — was run by hand in a browser and proves nothing about tomorrow. That is
the honest state, and it is what Phase 1.5 exists to fix.

---

## Phase 1.5 — Hardening

The UI is demo-ready and not yet enterprise-ready. These are the gaps, in the
order they should be closed. Each has one owner, one file set, and a finish line
that is checkable by someone else.

**H1–H3 come first and block nothing else — they are what make the rest safe to
do.** H1 is the single highest-value item in this document.

### H1 · Test harness + CI — **SMK** — `package.json`, `vitest.config.ts`, `.github/workflows/**`, `src/lib/**/*.test.ts`, `src/components/**/*.test.tsx`

Vitest + Testing Library + `jest-axe`. Port the sweeps that have only ever been
run by hand into real tests: contrast across both schemes, the four scale bands
rendering, fleet totals matching the artboard (137/97/22/9/4/3), Wed→Tue period
maths, paise↔rupee conversion. GitHub Actions runs `tsc`, `lint`, `build`, `test`
on every push.
**Finish line:** CI red on a deliberately broken `resolvePeriod`, green on `main`.

### H2 · Route guards + error boundaries — **SMK** — `src/app/router.tsx`, `src/app/guards/**`, `src/components/ErrorBoundary.tsx`

RBAC is cosmetic today: `navForRole` hides the link, but a `FLEET_STAFF` user who
types `/payments/run` gets the payment run. Add a role guard per route and an
`errorElement`, so one thrown render does not blank the app.
**Finish line:** staff persona on `/payments/run` gets a denial, not the screen;
a component throwing shows a recoverable panel, not white.

### H3 · Code splitting — **SMK** — `src/app/router.tsx`, `vite.config.ts`

One 1.38MB bundle (427KB gzipped) ships every screen to every user. Lazy-load per
route with a Suspense fallback.
**Finish line:** initial JS under 200KB gzipped; a documented budget in CI.

### H4 · Accessibility plumbing — **SMK (shared) → Abhiram (adopt)** — SMK: `src/layouts/**`, `src/hooks/useAnnounce.ts`; Abhiram: `src/pages/riders/**`, `src/pages/assignments/**`

No skip link, no focus management on navigation, zero `aria-live` regions — every
save and error is silent to a screen reader. SMK builds the skip link, route-change
focus, and an announce hook; Abhiram adopts the hook in the rider and assignment
flows as SMK does in his.
**Finish line:** `jest-axe` clean on every route in both schemes; a save on
onboarding and on deboard is announced.

### H5 · Unsaved-changes guard — **SMK (shared) → Abhiram (adopt)** — SMK: `src/hooks/useUnsavedChanges.ts`; Abhiram: onboarding, assign, exchange, deboard

Half-finished rider onboarding is lost to a misclick on the rail. One hook off
RHF's `isDirty`, wired into every form that can lose work.
**Finish line:** navigating away from a dirty form prompts; a clean one does not.

### H6 · The failure matrix — **SMK (client) → both (screens)** — SMK: `src/lib/api/client.ts`; then each owner in their own pages

Mock data always resolves. Nothing handles timeouts, retries, or a 409 when two
people deboard the same rider. Define the error contract in the client, then each
owner handles it on their screens.
**Finish line:** a forced 500, a timeout and a 409 each produce a specific,
recoverable message on every list and every form.

### H7 · Pagination + scale contract — **SMK** — `src/types/**`, `src/lib/api/**`, list pages

Fixtures are 137 rows; the real fleet is 10,000+. Agree the server-side
pagination/sort/filter DTO now, because it is a `src/types/` change and that is
the API contract the backend will be built against.
**Finish line:** list APIs take page/size/sort/filter and return a total; a 10k
fixture scrolls without jank.

### H8 · Feedback system — **SMK** — `src/components/Toast.tsx`, `src/app/**`

Feedback is inline banners only, so a save at the bottom of a long form goes
unseen. One toast surface, announced politely for assistive tech.
**Finish line:** every mutation in the app reports through it.

### H9 · Operator workflow — **SMK (vehicles/payments) · Abhiram (riders)** — respective page sets

Bulk actions and multi-select, saved views, column config, CSV export. Each owner
does their own lists so the file sets stay disjoint.
**Finish line:** 20 bikes marked inspected in one action; a filtered rider list
exports.

### H10 · Telemetry — **SMK** — `src/main.tsx`, infra

Error reporting and a performance budget, so a production failure is a report
rather than a phone call.
**Finish line:** a thrown error appears in the dashboard with a stack.

---

## Who does what

| Area | Owner | Paths |
| --- | --- | --- |
| Shared layer — theme, tokens, motion, layouts, shared components, router, session, mock API | **SMK** | `src/theme/**`, `src/layouts/**`, `src/components/**`, `src/app/**`, `src/lib/**`, `src/mocks/**` |
| API contract | **SMK** | `src/types/**` — Abhiram requests changes, does not edit |
| Vehicles, inspection, QC, service | **SMK** | `src/pages/vehicles/**`, `src/pages/workshop/**`, `src/pages/service/**` |
| Dashboard, operations, recovery | **SMK** | `src/pages/Dashboard.tsx`, `src/pages/operations/**`, `src/pages/recovery/**` |
| Money — payment run, receipts, overdue | **SMK** | `src/pages/payments/**` |
| Users, roles, audit log | **SMK** | `src/pages/users/**`, `src/pages/admin/**` |
| Riders — list, detail, onboarding | **Abhiram** | `src/pages/riders/**` |
| Assignments — assign, exchange, deboard, settlement | **Abhiram** | `src/pages/assignments/**` |
| Backend, DB, infra, CI | **SMK** | `backend/**`, `db/**`, `infra/**`, `.github/**` |

Hardening follows the same lines: **SMK builds shared plumbing, Abhiram adopts it
in his two page sets.** Neither edits the other's files.

---

## Ownership rules

- One person, one file set. Never both on one file. If you need a change in
  someone else's file, ask — do not reach in.
- `src/types/` is the API contract. It changes by agreement, not in passing.
- Say it before you pull. Both page sets are live; a surprise rebase costs an hour.
- Gates before every commit: `npm run build` and `npm run lint` (oxlint, zero
  warnings). After H1, `npm test` joins them and CI enforces all three.
- Shared components are shared. If a screen needs a one-off colour or spacing,
  that is a signal the token is wrong — raise it, do not override locally.

---

## Product phases

**Phase 1 — replace the paper/Excel registry. Web only, admins only.** *(UI built)*
- Manage tenants + subscription plans
- Vehicle registry (manual chassis entry)
- Rider records + documents
- Assign bike to rider, **weekly rent on a Wed→Tue cycle**, deposit captured per
  rider, late fee on overdue
- Manual payment recording, overdue list, receipts
- Weekly SMS reminder
- Simple blacklist (reason text, tenant admin decides)
- Fleet-owner inquiry / onboarding form inside the app
- Migrate existing 150 bikes and riders

**Phase 1.5 — hardening.** The ten workstreams above. Nothing here is optional for
a system that moves money.

**Phase 2 — make it operational.**
Rider mobile app, field-engineer app (tickets, repair cost), online payments,
maintenance/utilization/battery tracking, chassis photo reading, blacklist
disputes, WhatsApp + push, proper reports.

**Phase 3 — differentiate.**
GPS live location (bikes already have trackers + smart locks), auto eKYC,
incentives, predictive maintenance, tenant self-signup.

---

## Ground rules

- Every tenant's data filtered server-side by the logged-in user. Never trust the frontend.
- Foreign keys enforced in the DB. Money and audit rows are append-only (corrections = new row).
- Every list paginated. SMS async through the queue. Audit log on money, KYC, blacklist.
- No Aadhaar stored in full (masked only).
- Rupees at the desk, paise on the wire. Converted once, at the API boundary.

## Still open (from Ashok)

- **Billing day.** The app runs a fixed Wed→Tue week. Does every rider bill on the
  same cycle, or does each carry their own payment day? This changes the schema,
  so it is the one to chase first.
- Existing paper/DB records, onboarding form fields, service workflow.
