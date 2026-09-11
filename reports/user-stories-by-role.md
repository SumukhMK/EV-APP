# User Stories by Role — FleeTech OS

> Generated from the live codebase. Each story maps to a verified screen, mutation,
> or navigation action in `src/pages/`, `src/lib/api/`, and `src/app/nav.ts`.

---

## Role Overview

| Role | Scope | Sections visible |
|------|-------|-----------------|
| **Super admin** | The platform owner. Every tenant, every bike, plans and the shared blacklist. | Operations, Fleet, Riders, Money, Admin |
| **Tenant admin** | Runs one fleet end to end — bikes, riders, rent, service, dashboards. | Operations, Fleet, Riders, Money, Admin |
| **Fleet staff** | Day-to-day fleet work: inductions, inspections, recording returns. | Operations, Fleet, Riders |
| **Service manager** | The workshop: repairs, QC decisions and service charges. | Operations, Fleet |

---

## 1. Super Admin

### Operations

| # | Story | Screen |
|---|-------|--------|
| SA-1 | As a super admin, I want to see a summary of today's vehicle movements (deployed, exchanged, returned, recovered) so that I can gauge operational tempo at a glance. | `/operations/today` |
| SA-2 | As a super admin, I want to filter the daily summary by day, week, or month so that I can compare activity across time periods. | `/operations/today` (PeriodToggle) |
| SA-3 | As a super admin, I want to see per-hub utilisation (deployed as a % of bikes held) so that I can identify under-utilised hubs. | `/operations/today` (Hub utilisation panel) |

### Fleet

| # | Story | Screen |
|---|-------|--------|
| SA-4 | As a super admin, I want to see fleet-level stat tiles (total, deployed, ready, under repair, QC pending, recovery) on a dashboard so that I can monitor fleet health without digging into lists. | `/dashboard` |
| SA-5 | As a super admin, I want to click a fleet tile and jump to the filtered vehicle list so that I can investigate the underlying numbers. | `/dashboard` -> `/vehicles?state=...` |
| SA-6 | As a super admin, I want to view monthly deployment trends on a bar chart so that I can spot growth or seasonal patterns. | `/dashboard` |
| SA-7 | As a super admin, I want to search and filter the vehicle registry by state, make, battery type, or hub so that I can find a specific bike or group quickly. | `/vehicles` |
| SA-8 | As a super admin, I want to open a vehicle's detail page and see its specs, current rider, lifecycle timeline, and assignment history so that I have the full picture of that bike. | `/vehicles/:id` |
| SA-9 | As a super admin, I want to add a single new vehicle (INUCTED) via a form so that it enters the registry when a bike is purchased off the shelf. | `/vehicles/new` |
| SA-10 | As a super admin, I want to bulk-upload a spreadsheet of new vehicles so that I can onboard a large batch without entering each one manually. | `/vehicles/bulk-upload` |
| SA-11 | As a super admin, I want to record a walk-in or roadside inspection and decide the vehicle's next state (ready, under repair, or accident) so that the yard knows what to do with it. | `/inspections` |
| SA-12 | As a super admin, I want to view the QC queue and pass or fail each bike so that only repaired bikes return to the ready pool. | `/qc` |
| SA-13 | As a super admin, I want to see the under-repair and in-service queues at a glance so that I can gauge workshop load. | `/service` |

### Riders

| # | Story | Screen |
|---|-------|--------|
| SA-14 | As a super admin, I want to view the rider register filtered by status, platform, or vehicle state so that I can find riders by various criteria. | `/riders` |
| SA-15 | As a super admin, I want to open a rider's detail page and see their identity, contact, commercial info, current vehicle, payment history, and assignment history so that I have a complete rider profile. | `/riders/:id` |
| SA-16 | As a super admin, I want to onboard a new rider through a 4-step form (identity, contact, address, commercial) so that they join the register with verified KYC and contact details. | `/riders/onboard` |
| SA-17 | As a super admin, I want to assign a bike to a rider who has no vehicle so that the rider can start earning. | `/assignments/assign` |
| SA-18 | As a super admin, I want to exchange a rider's current bike for another while recording the return condition so that the old bike enters the correct workflow. | `/assignments/exchange` |
| SA-19 | As a super admin, I want to deboard a rider — recording the return condition, outstanding dues, deposit settlement, and next bike state — so that the bike is released and the rider's account is settled. | `/assignments/deboard` |

### Money

| # | Story | Screen |
|---|-------|--------|
| SA-20 | As a super admin, I want to view the weekly payment run (Monday or Wednesday cycle) with stat tiles (riders billed, total, collected, outstanding, fully paid) so that I know the collection status at a glance. | `/payments/run` |
| SA-21 | As a super admin, I want to open an individual rider's payment receipt from the run and record a payment (full or partial, by UPI / cash / bank transfer) so that the ledger is updated. | `/payments/run/:riderId` -> RecordPaymentDialog |
| SA-22 | As a super admin, I want to see the overdue riders list with dunning stages (reminder, warning, final warning, repossession due) so that I can prioritise collection efforts. | `/payments/overdue` |
| SA-23 | As a super admin, I want to send a payment reminder to an individual overdue rider or to all overdue riders at once so that they are nudged to pay. | `/payments/overdue` (Send reminder / Remind all) |
| SA-24 | As a super admin, I want to call an overdue rider directly from the list by tapping their phone number so that I can follow up personally. | `/payments/overdue` (tel: link) |
| SA-25 | As a super admin, I want to view the recovery summary — bikes that are partially paid, not paid, left at roadside, missing, or involved in accidents — so that I can track repossession efforts. | `/recovery` |

### Admin

| # | Story | Screen |
|---|-------|--------|
| SA-26 | As a super admin, I want to see all user accounts with their roles and statuses so that I know who has access to the platform. | `/users` |
| SA-27 | As a super admin, I want to edit a user's name, email, role, or status so that I can manage the team as people join, change roles, or leave. | `/users` -> EditUserDialog |
| SA-28 | As a super admin, I want to view a read-only audit log of all actions (who did what, when, what changed) so that I have an accountable trail for compliance and dispute resolution. | `/audit` |

---

## 2. Tenant Admin

> A tenant admin has the same operational scope as a super admin within their
> fleet. The stories below are identical; the difference is data scope — a tenant
> admin sees only their tenant's bikes and riders.

### Operations

| # | Story | Screen |
|---|-------|--------|
| TA-1 | As a tenant admin, I want to see today's vehicle movements and hub utilisation so that I can monitor my fleet's daily activity. | `/operations/today` |
| TA-2 | As a tenant admin, I want to toggle between day, week, and month views so that I can compare activity across different periods. | `/operations/today` (PeriodToggle) |

### Fleet

| # | Story | Screen |
|---|-------|--------|
| TA-3 | As a tenant admin, I want to see a dashboard of fleet stat tiles and deployment trends so that I can track my fleet's health. | `/dashboard` |
| TA-4 | As a tenant admin, I want to search, filter, and paginate the vehicle registry so that I can manage my fleet's bikes. | `/vehicles` |
| TA-5 | As a tenant admin, I want to view a vehicle's full detail — specs, rider, timeline, history — so that I can make informed decisions about it. | `/vehicles/:id` |
| TA-6 | As a tenant admin, I want to add a new vehicle or bulk-upload a batch so that new inventory enters the system. | `/vehicles/new`, `/vehicles/bulk-upload` |
| TA-7 | As a tenant admin, I want to record inspections, pass/fail QC, and view service queues so that I can keep the workshop moving. | `/inspections`, `/qc`, `/service` |

### Riders

| # | Story | Screen |
|---|-------|--------|
| TA-8 | As a tenant admin, I want to view and search the rider register so that I can find and manage riders. | `/riders` |
| TA-9 | As a tenant admin, I want to onboard, assign, exchange, and deboard riders so that the rider lifecycle is managed end to end. | `/riders/onboard`, `/assignments/assign`, `/assignments/exchange`, `/assignments/deboard` |
| TA-10 | As a tenant admin, I want to view a rider's full profile (identity, contact, commercial, vehicle, payments, history) so that I can resolve any query about that rider. | `/riders/:id` |

### Money

| # | Story | Screen |
|---|-------|--------|
| TA-11 | As a tenant admin, I want to run the weekly payment run and record incoming payments so that the fleet's revenue is tracked. | `/payments/run`, `/payments/run/:riderId` |
| TA-12 | As a tenant admin, I want to see overdue riders grouped by dunning stage and send reminders so that collections are managed proactively. | `/payments/overdue` |
| TA-13 | As a tenant admin, I want to view the recovery queue so that bikes needing repossession are not lost. | `/recovery` |

### Admin

| # | Story | Screen |
|---|-------|--------|
| TA-14 | As a tenant admin, I want to manage user accounts (edit name, role, status) so that my team has the right access. | `/users` |
| TA-15 | As a tenant admin, I want to view the audit log so that I have an accountable record of all operations. | `/audit` |

---

## 3. Fleet Staff

### Operations

| # | Story | Screen |
|---|-------|--------|
| FS-1 | As fleet staff, I want to see today's vehicle movements and hub utilisation so that I know the operational status at the start of my shift. | `/operations/today` |
| FS-2 | As fleet staff, I want to toggle between day, week, and month views so that I can check recent activity. | `/operations/today` (PeriodToggle) |

### Fleet

| # | Story | Screen |
|---|-------|--------|
| FS-3 | As fleet staff, I want to see fleet stat tiles on the dashboard so that I can quickly gauge how many bikes are deployed, ready, or in the workshop. | `/dashboard` |
| FS-4 | As fleet staff, I want to search the vehicle registry and filter by state, make, or battery type so that I can locate a specific bike. | `/vehicles` |
| FS-5 | As fleet staff, I want to view a vehicle's detail page so that I can check its specs, current rider, and lifecycle history. | `/vehicles/:id` |
| FS-6 | As fleet staff, I want to add a new vehicle via a form so that a bike that just arrived gets logged. | `/vehicles/new` |
| FS-7 | As fleet staff, I want to bulk-upload a spreadsheet of new vehicles so that a batch of bikes is onboarded in one go. | `/vehicles/bulk-upload` |
| FS-8 | As fleet staff, I want to record a walk-in inspection and set the vehicle's next state so that the yard knows whether it is ready, needs repair, or is an accident case. | `/inspections` |
| FS-9 | As fleet staff, I want to view the QC queue and pass or fail repaired bikes so that only roadworthy bikes go back to the ready pool. | `/qc` |
| FS-10 | As fleet staff, I want to see the service queues (under-repair and in-service) at a glance so that I can communicate workshop status to the team. | `/service` |

### Riders

| # | Story | Screen |
|---|-------|--------|
| FS-11 | As fleet staff, I want to view the rider register with filters so that I can find riders by status, platform, or vehicle state. | `/riders` |
| FS-12 | As fleet staff, I want to open a rider's profile and see their identity, contact, commercial details, vehicle, and payment history so that I can answer any question about that rider. | `/riders/:id` |
| FS-13 | As fleet staff, I want to onboard a new rider through a multi-step KYC form so that they are registered with verified identity, contact, and commercial details. | `/riders/onboard` |
| FS-14 | As fleet staff, I want to assign a ready bike to an unassigned rider so that the rider can start their shifts. | `/assignments/assign` |
| FS-15 | As fleet staff, I want to exchange a rider's bike for another while recording the return condition and reason so that the old bike enters the correct repair workflow. | `/assignments/exchange` |
| FS-16 | As fleet staff, I want to deboard a rider — recording the return condition, settling their deposit and outstanding dues, and routing the bike — so that the rider's contract is cleanly closed. | `/assignments/deboard` |

### Access Restrictions

- Fleet staff **cannot** access the Money section (payment run, overdue riders, recovery).
- Fleet staff **cannot** access the Admin section (users, audit log).

---

## 4. Service Manager

### Operations

| # | Story | Screen |
|---|-------|--------|
| SM-1 | As a service manager, I want to see today's vehicle movements and hub utilisation so that I know how many bikes moved through the workshop today. | `/operations/today` |
| SM-2 | As a service manager, I want to toggle between day, week, and month views so that I can track workshop throughput over time. | `/operations/today` (PeriodToggle) |

### Fleet

| # | Story | Screen |
|---|-------|--------|
| SM-3 | As a service manager, I want to see fleet stat tiles (especially under repair, QC pending, accident, recovery) on the dashboard so that I know my workshop load. | `/dashboard` |
| SM-4 | As a service manager, I want to search the vehicle registry and filter by state so that I can find bikes that need attention. | `/vehicles` |
| SM-5 | As a service manager, I want to view a vehicle's detail — specs, lifecycle timeline, and assignment history — so that I understand its repair context. | `/vehicles/:id` |
| SM-6 | As a service manager, I want to record a walk-in or roadside inspection and decide the next state (ready, under repair, or accident) so that the bike is routed correctly. | `/inspections` |
| SM-7 | As a service manager, I want to view the QC queue, see each bike's repair summary and cost, and pass or fail it so that only properly repaired bikes return to service. | `/qc` |
| SM-8 | As a service manager, I want to fail a QC check with a reason so that the bike is sent back to the workshop with clear instructions. | `/qc` (Fail QC dialog) |
| SM-9 | As a service manager, I want to see the under-repair and in-service queues with counts so that I can manage technician workload and parts availability. | `/service` |

### Access Restrictions

- Service managers **cannot** see the Riders section (rider register, onboard, assign, exchange, deboard).
- Service managers **cannot** access the Money section (payment run, overdue riders, recovery).
- Service managers **cannot** access the Admin section (users, audit log).

---

## Cross-Role: Common Workflows

These multi-screen stories span several screens and are relevant to the roles that can access them.

### Vehicle Lifecycle (All roles)

1. A new bike arrives → **Add vehicle** or **Bulk upload** (state: INDUCTED).
2. A technician inspects it → **Record inspection** (state: READY_TO_DEPLOY or UNDER_REPAIR).
3. If under repair → repair happens → **QC queue** → Pass (state: READY_TO_DEPLOY).
4. A fleet hand assigns it → **Assign vehicle** (state: DEPLOYED).
5. The rider uses it for weeks, then returns it → **Exchange vehicle** or **Deboard rider** (state: RETURNED / UNDER_REPAIR / ACCIDENT).
6. The returned bike is inspected again → cycle repeats until RETIRED.

### Rider Onboarding (Super admin, Tenant admin, Fleet staff)

1. A new rider walks in → **Onboard rider** (identity KYC → contact verification → address → commercial terms).
2. Once KYC is complete and a bike is available → **Assign vehicle**.
3. The rider cycles through the platform → **Exchange vehicle** (swap bike) or **Deboard rider** (close contract).

### Payment Collection (Super admin, Tenant admin)

1. The billing cycle triggers → **Weekly payment run** (Monday or Wednesday).
2. Admin sees riders billed, amounts, collected, outstanding.
3. Admin clicks into a rider's receipt → **Record payment** (full or partial).
4. Riders who don't pay → appear in **Overdue riders** list with escalating dunning stages.
5. Admin sends reminders → calls riders → tracks recovery.
6. Worst cases → bikes need repossession → **Recovery** queue.

### Workshop Operations (All roles for visibility; Service manager for decisions)

1. A bike comes back (returned / accident) → **Inspection** decides its fate.
2. If repaired → enters **QC queue**.
3. Service manager reviews repair details → **Pass** (back to ready pool) or **Fail** (back to under repair with a reason).
4. Everyone can see the **Service queues** overview to track workshop load.
