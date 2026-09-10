# Architecture — EV Rental Platform

High-level shape of the system. The decisions here are not new: they were locked
in the original Phase 1 plan and are restated so the diagram has a written
counterpart. Where the front end has since moved on from that plan, this file
records what is actually true today.

**Diagram:** [`ev-rental-architecture.excalidraw`](./ev-rental-architecture.excalidraw)
(editable — open at excalidraw.com), rendered to
[`.svg`](./ev-rental-architecture.svg) and [`.png`](./ev-rental-architecture.png).
Regenerate with `python3 docs/architecture/build_diagram.py`.

---

## The one-paragraph version

A multi-tenant web platform for running electric-bike rental fleets. A React
admin app talks to a Spring Boot REST API over HTTPS. The API authenticates with
JWT, resolves which tenant the caller belongs to, and pushes that tenant id down
into the database session — PostgreSQL Row-Level Security does the actual
isolation, so a query cannot return another tenant's rows even if application
code forgets to filter. Anything slow or scheduled (SMS reminders, the weekly
billing run) leaves the request path and runs async. External providers sit
behind that async boundary.

---

## Tiers

### Clients

| | Phase | Notes |
|---|---|---|
| Admin web app | 1 | React 19, Vite, TypeScript, MUI, TanStack Query, React Hook Form + Zod |
| Rider mobile app | 2 | Rent, pay, raise a ticket |
| Field engineer app | 2 | Job cards, repair cost, QC |

The admin app is the only Phase 1 client. It currently runs entirely against
mock JSON in `frontend/app/src/lib/api/*` — every fixture is shaped as the API
response we intend to ask for, so `frontend/app/src/types/` **is** the draft API
contract. When the backend lands, `lib/api/client.ts` is the single swap point;
no screen changes.

### Edge

Nginx: TLS termination, static asset serving, rate limiting. Nothing clever.

### API — Spring Boot 3.3 / Java 21

Cross-cutting band, applied to every request:

- **Spring Security + JWT.** 15 minute access token, 7 day refresh, rotation on
  refresh, revocation recorded in `refresh_tokens.revoked_at`. BCrypt for passwords.
- **TenantFilter.** Reads the `tenant_id` claim and issues
  `SET LOCAL app.tenant_id = '<uuid>'` at the start of the transaction.
- **Role gate.** `SUPER_ADMIN` / `TENANT_ADMIN` / `TENANT_STAFF`.

Module boundaries (`com.evrental.*`):

| Module | Owns |
|---|---|
| `auth` | login, refresh, me, password reset |
| `platform` | super-admin: tenants, plans, inquiries, analytics |
| `tenantadmin` | vehicles, riders, assignments, payments, service, recovery |
| `shared` | cross-tenant blacklist (keyed by phone, read across tenants) |
| `notification` | email and SMS dispatch |
| `excel` | `.xlsx` bulk import for the 150-bike migration |
| `common` | exceptions, DTOs, util |

### Data

**PostgreSQL 16** is the only Phase 1 datastore. Flyway owns the schema.

Tenant isolation is enforced in the database, not the application:

```sql
ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bikes
  USING (tenant_id::text = current_setting('app.tenant_id', true));
```

Every domain table carries `tenant_id uuid NOT NULL`. Super-admin endpoints
bypass RLS deliberately and explicitly, never by accident.

Redis (cache, sessions, rate limits) and object storage (rider documents,
chassis photos) are Phase 2. Phase 1 does not need them and adding them early
buys nothing but operational surface.

### Async and scheduled

Phase 1 uses `@Async` on a `ThreadPoolTaskExecutor` — a queue is not worth
running for one reminder job. RabbitMQ arrives in Phase 2 when retries,
dead-lettering and multiple consumers start to matter. Jobs: the Monday SMS
reminder and the weekly billing run.

### External

SMTP (MailHog locally) then a real SMS gateway in Phase 1. WhatsApp and a
payment gateway in Phase 2. GPS / telematics in Phase 3 — the bikes already
carry trackers and smart locks.

---

## Rules that shape the design

These come from `docs/BUILD.md` and hold everywhere:

- **Tenant data is filtered server-side, by the logged-in user. Never trust the
  frontend.** RLS is the enforcement, not a convention.
- **Foreign keys are enforced in the database.**
- **Money and audit rows are append-only.** A correction is a new row, never an
  edit. This is why the audit log screen is read-only by design.
- **Every list is paginated.** No endpoint returns "all".
- **Money is minor units (paise) on the wire**, integer, never a float.
- **SMS is async, through the queue.**
- **Audit log on money, KYC and blacklist.**
- **Aadhaar is never stored in full** — masked only.

---

## Where the plan and reality differ

The original Phase 1 plan (recoverable at `git show 1032005:docs/PHASE_1_PLAN.md`)
specified shadcn/ui + Tailwind and a thinner domain. The front end that actually
got built diverges in two ways worth recording:

1. **UI library is MUI, not shadcn/Tailwind.** The signed-off wireframe shipped
   its own design system ("Nocturne"), transcribed into
   `frontend/app/src/theme/`. Screens consume the theme and shared components,
   never raw hex.
2. **The domain is richer than the plan's `bikes / riders / rentals / payments`.**
   It now carries a nine-state vehicle lifecycle including `RECOVERY`, rider
   identity verification, two billing cycles, service queues, a recovery board
   and an audit trail. `frontend/app/src/types/` is the current truth; the
   backend should be built against it rather than the older schema sketch.

Neither is a problem — the front end was deliberately built first, against mock
JSON, so that the schema would be argued about on screen before it was written
into migrations. But the backend must be built from `src/types/`, not from the
older table list.

---

## Open question

One contract conflict is still unresolved and needs Ashok:

**Does the per-rider payment day or the fixed Wednesday→Tuesday period govern
billing?** The prototype offers all seven days per rider *and* a fixed weekly
period. Both cannot be true. We capture `paymentDay` and display it, and it
drives no calculation. See the contract table in
`docs/superpowers/plans/2026-09-07-prototype-ui-components.md`.
