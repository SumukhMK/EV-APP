# Phase 1 Plan — EV Rental Platform (LOCKED)

**Status:** Locked. Do not change mid-sprint without explicit user approval.
**Branch:** `phase-1-scaffold`
**Duration:** 3 days
**Quality bar:** MVP-grade, demo-ready, not production-hardened.

---

## 1. Stack (locked)

### Backend
| Tool | Version | Notes |
|---|---|---|
| Java | 21 | LTS |
| Spring Boot | 3.3.x | |
| Build | Maven | not Gradle |
| DB | PostgreSQL 16 | via Docker Compose locally |
| Migrations | Flyway | `db/migration/V*.sql` |
| Auth | Spring Security + JWT (jjwt 0.12) | access + refresh |
| Email | spring-boot-starter-mail + MailHog (local) | SMTP, no real provider in Phase 1 |
| Excel | Apache POI 5.x | `.xlsx` import only |
| API docs | springdoc-openapi 2.x | `/swagger-ui.html` |
| Tests | JUnit 5, Testcontainers (postgres) | critical paths only |

**Cut from Phase 1 (do not implement):**
- Redis (use Caffeine in-memory cache)
- RabbitMQ (use `@Async` + `ThreadPoolTaskExecutor`)
- S3 / file storage (local FS in dev)
- SMS / WhatsApp (email only)
- Sentry / observability stack

### Frontend
| Tool | Version | Notes |
|---|---|---|
| Node | 20 LTS | |
| Framework | React 18 | |
| Build | Vite 5 | |
| Language | TypeScript 5 | strict mode |
| Routing | React Router 6 | |
| Data | TanStack Query 5 | server state |
| Forms | React Hook Form + Zod | |
| HTTP | axios + interceptors | refresh-token rotation |
| UI | shadcn/ui + Tailwind 3 | Radix primitives |
| Charts | Recharts | dashboards |
| Icons | lucide-react | |
| Date | date-fns | |

**Cut from Phase 1:**
- Storybook
- E2E tests (Playwright) — manual smoke only
- i18n (English only)

### Infra
- `docker-compose.yml` with: `postgres:16`, `mailhog`
- No Redis, no RabbitMQ in compose.

---

## 2. Architecture

### Multi-tenancy: shared schema + tenant_id + Postgres RLS

**Why:** 100+ tenants, fast onboarding, easy backups. Schema-per-tenant is too heavy for Phase 1.

**How:**
- Every domain table has `tenant_id uuid NOT NULL` and FK to `tenants(id)`.
- PostgreSQL Row-Level Security enabled on every domain table:
  ```sql
  ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON bikes
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  ```
- Backend sets `SET LOCAL app.tenant_id = '<uuid>'` at start of every transaction via a `HibernateFilter` or `OncePerRequestFilter` + `TransactionTemplate`.
- JWT carries `tenant_id` claim (null for SUPER_ADMIN).
- SUPER_ADMIN endpoints use a separate JDBC datasource or explicit `SET app.tenant_id = ''` to bypass RLS.

### Module boundaries (backend packages)
```
com.evrental
  ├── config          (security, jwt, cors, openapi)
  ├── tenant          (TenantContext, filter, RLS enable)
  ├── auth            (login, refresh, me, password reset)
  ├── platform        (super-admin: tenants, plans, inquiries, analytics)
  ├── tenantadmin     (bikes, riders, rentals, payments, blacklist, staff)
  ├── shared          (shared blacklist read)
  ├── notification    (email service only)
  ├── excel           (xlsx importer)
  └── common          (exceptions, dto, util)
```

### Auth flow
- `POST /api/auth/login` → `{ accessToken, refreshToken, user: { id, email, role, tenantId, permissions[] } }`
- Access token: 15 min, in memory
- Refresh token: 7 days, httpOnly cookie (or localStorage for Phase 1 — see security note)
- `POST /api/auth/refresh` rotates refresh
- `POST /api/auth/logout` invalidates refresh (DB-side `revoked_at`)
- Password hashing: BCrypt

**Security note for Phase 1:** refresh token in `localStorage` is acceptable for MVP. Move to httpOnly cookie before production.

---

## 3. Database schema (locked)

All tables include `created_at`, `updated_at` unless noted. UUID primary keys.

### Core tables

```
tenants
  id uuid PK
  name text
  slug text UNIQUE
  plan_id uuid FK -> plans
  status text  -- ACTIVE / SUSPENDED / TRIAL
  contact_email text
  contact_phone text
  city text
  created_at, updated_at

plans
  id uuid PK
  code text UNIQUE  -- STARTER / GROWTH / ENTERPRISE
  name text
  price_monthly numeric
  max_bikes int
  max_riders int
  max_staff int
  features jsonb
  is_active bool

users
  id uuid PK
  tenant_id uuid NULL  -- null for SUPER_ADMIN
  email text UNIQUE
  password_hash text
  full_name text
  phone text
  role text  -- SUPER_ADMIN / TENANT_ADMIN / TENANT_STAFF
  status text  -- ACTIVE / DISABLED
  last_login_at timestamp
  created_at, updated_at

refresh_tokens
  id uuid PK
  user_id uuid FK -> users
  token_hash text UNIQUE
  expires_at timestamp
  revoked_at timestamp NULL
  created_at

subscriptions
  id uuid PK
  tenant_id uuid FK
  plan_id uuid FK
  started_at timestamp
  expires_at timestamp
  status text  -- ACTIVE / EXPIRED / CANCELLED
  created_at, updated_at

bikes
  id uuid PK
  tenant_id uuid FK
  model text
  registration_number text
  chassis_number text
  status text  -- AVAILABLE / RENTED / MAINTENANCE / RETIRED
  battery_level int
  current_rider_id uuid NULL FK -> riders
  acquired_at date
  created_at, updated_at
  UNIQUE (tenant_id, registration_number)

riders
  id uuid PK
  tenant_id uuid FK
  full_name text
  phone text
  email text NULL
  aadhaar_last4 text
  address text
  city text
  status text  -- ACTIVE / BLOCKED / INACTIVE
  blocked_at timestamp NULL
  blocked_by_user_id uuid NULL
  block_reason text NULL
  created_at, updated_at
  INDEX (tenant_id, phone)

rentals
  id uuid PK
  tenant_id uuid FK
  bike_id uuid FK -> bikes
  rider_id uuid FK -> riders
  started_at timestamp
  ended_at timestamp NULL
  weekly_rate numeric
  deposit_amount numeric DEFAULT 5000
  status text  -- BOOKED / ACTIVE / RETURNED / CANCELLED
  notes text
  created_at, updated_at
  INDEX (tenant_id, status, started_at)

payments
  id uuid PK
  tenant_id uuid FK
  rental_id uuid FK -> rentals
  amount numeric
  type text  -- DEPOSIT / RENT / LATE_FEE / REFUND
  due_date date
  paid_date date NULL
  payment_method text  -- CASH / UPI / BANK / OTHER
  reference text  -- UPI txn id, etc
  status text  -- PENDING / PAID / OVERDUE / WAIVED
  week_of date  -- Monday of the week this payment covers
  created_at, updated_at
  INDEX (tenant_id, due_date)
  INDEX (tenant_id, status)

blacklist_shared
  id uuid PK
  rider_phone text NOT NULL  -- keyed by phone, not rider_id, so cross-tenant
  rider_name text
  reason text
  blocked_by_tenant_id uuid FK -> tenants
  blocked_at timestamp
  is_active bool
  created_at, updated_at
  UNIQUE (rider_phone, blocked_by_tenant_id)

inquiries  -- public form
  id uuid PK
  company_name text
  contact_name text
  email text
  phone text
  city text
  fleet_size text  -- "10-50", "50-200", "200+"
  plan_interest text NULL
  message text
  status text  -- NEW / CONTACTED / QUALIFIED / REJECTED / CONVERTED
  created_at, updated_at

audit_logs
  id uuid PK
  tenant_id uuid NULL
  actor_user_id uuid NULL
  action text  -- LOGIN / CREATE / UPDATE / DELETE / BLOCK / UNBLOCK / etc
  entity_type text
  entity_id uuid NULL
  payload jsonb
  ip_address text
  created_at
  INDEX (tenant_id, created_at DESC)
```

### Multi-tenancy enforcement
Every domain table (bikes, riders, rentals, payments, blacklist_shared via `blocked_by_tenant_id`, users when tenant-scoped) has `tenant_id` column. RLS policy on each:
```sql
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id::text = current_setting('app.tenant_id', true));
```
`blacklist_shared` is keyed by phone — read across all tenants, write only by tenant admins (validated at app layer).

---

## 4. API contract (locked)

All paths prefixed with `/api`. JSON. Auth via `Authorization: Bearer <accessToken>` except where noted.

### Public (no auth)
| Method | Path | Purpose |
|---|---|---|
| POST | `/public/inquiries` | Fleet-owner inquiry form (rate-limited) |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Send reset email |
| POST | `/auth/reset-password` | Set new password |
| GET | `/health` | Liveness |

### Authenticated (any role)
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/auth/me` | all | Current user + permissions |
| POST | `/auth/logout` | all | Revoke refresh |

### SUPER_ADMIN only (`/admin/**`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/tenants` | List tenants (paginated, filter by status/plan) |
| POST | `/admin/tenants` | Create tenant + first admin |
| GET | `/admin/tenants/{id}` | Tenant detail |
| PATCH | `/admin/tenants/{id}` | Update tenant |
| DELETE | `/admin/tenants/{id}` | Soft delete (status=SUSPENDED) |
| GET | `/admin/plans` | List plans |
| POST | `/admin/plans` | Create plan |
| PATCH | `/admin/plans/{id}` | Update plan |
| GET | `/admin/inquiries` | List inquiries |
| PATCH | `/admin/inquiries/{id}` | Update inquiry status, add notes |
| GET | `/admin/analytics/platform` | Platform KPIs (tenant count, bike count, revenue) |
| GET | `/admin/audit-logs` | Audit log viewer |
| POST | `/admin/tenants/{id}/impersonate` | Super-admin acts as tenant admin (for support) |

### TENANT_ADMIN / TENANT_STAFF (`/tenant/**` — scoped to own tenant_id)
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/tenant/staff` | ADMIN | List staff |
| POST | `/tenant/staff` | ADMIN | Add staff |
| PATCH | `/tenant/staff/{id}` | ADMIN | Update staff |
| DELETE | `/tenant/staff/{id}` | ADMIN | Disable staff |
| GET | `/tenant/bikes` | both | List bikes |
| POST | `/tenant/bikes` | both | Add bike |
| GET | `/tenant/bikes/{id}` | both | Bike detail |
| PATCH | `/tenant/bikes/{id}` | both | Update bike |
| DELETE | `/tenant/bikes/{id}` | ADMIN | Retire bike |
| GET | `/tenant/riders` | both | List riders |
| POST | `/tenant/riders` | both | Add rider |
| GET | `/tenant/riders/{id}` | both | Rider detail |
| PATCH | `/tenant/riders/{id}` | both | Update rider |
| POST | `/tenant/riders/{id}/block` | both | Block rider (own + shared) |
| POST | `/tenant/riders/{id}/unblock` | both | Unblock rider |
| GET | `/tenant/rentals` | both | List rentals |
| POST | `/tenant/rentals` | both | Book rental |
| GET | `/tenant/rentals/{id}` | both | Rental detail |
| PATCH | `/tenant/rentals/{id}/assign` | both | Assign bike to rider |
| PATCH | `/tenant/rentals/{id}/return` | both | Mark returned |
| PATCH | `/tenant/rentals/{id}/cancel` | both | Cancel |
| GET | `/tenant/payments` | both | List payments |
| POST | `/tenant/payments` | both | Record payment |
| GET | `/tenant/payments/overdue` | both | Overdue list |
| POST | `/tenant/payments/{id}/waive` | ADMIN | Waive late fee |
| GET | `/tenant/blacklist/shared` | both | Shared blacklist (read-only) |
| GET | `/tenant/analytics` | both | Tenant KPIs |

### Pagination convention
Query params: `?page=0&size=20&sort=createdAt,desc`. Response shape:
```json
{ "content": [...], "page": 0, "size": 20, "totalElements": 142, "totalPages": 8 }
```

### Error shape
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...}, "timestamp": "..." } }
```
Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`.

---

## 5. Module ownership

| Owner | Tool | Owns | Doesn't touch |
|---|---|---|---|
| SMK (you) | Claude Code (Opus) | `backend/**`, `db/migration/**`, `docker-compose.yml`, `docs/openapi.yaml` | `frontend/**` |
| Abhiram | GitHub Copilot (Opus-tier) | `frontend/**` | `backend/**`, `db/**` |
| Both (shared) | — | `README.md`, `.gitignore`, root configs | — |

**The API contract in §4 is the seam.** Any change to a request/response shape requires updating `docs/PHASE_1_PLAN.md` AND posting in the group before continuing.

---

## 6. File tree

```
EV-APP/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── docs/
│   ├── BUILD.md              # product overview, phases
│   ├── PHASE_1_PLAN.md       # this file (source of truth)
│   ├── openapi.yaml          # generated/curated from backend
│   └── 19 02:54  - Notes by Gemini.pdf
├── backend/
│   ├── pom.xml
│   ├── Dockerfile
│   ├── src/main/java/com/evrental/
│   │   ├── EvRentalApplication.java
│   │   ├── config/
│   │   ├── tenant/
│   │   ├── auth/
│   │   ├── platform/
│   │   ├── tenantadmin/
│   │   ├── shared/
│   │   ├── notification/
│   │   ├── excel/
│   │   └── common/
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   ├── application-local.yml
│   │   └── db/migration/
│   │       ├── V1__init_core.sql
│   │       ├── V2__seed_plans.sql
│   │       ├── V3__tenant_users.sql
│   │       ├── V4__bikes_riders.sql
│   │       ├── V5__rentals_payments.sql
│   │       ├── V6__blacklist_inquiries.sql
│   │       └── V7__rls_policies.sql
│   └── src/test/java/...
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── Dockerfile
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── router.tsx
        ├── lib/
        │   ├── api.ts          # axios instance + interceptors
        │   ├── queryClient.ts  # TanStack Query setup
        │   └── auth.ts         # token storage, refresh logic
        ├── context/
        │   └── AuthContext.tsx
        ├── hooks/
        ├── components/
        │   ├── ui/             # shadcn primitives
        │   ├── layout/
        │   └── forms/
        ├── pages/
        │   ├── public/
        │   │   ├── Login.tsx
        │   │   ├── ForgotPassword.tsx
        │   │   └── Inquiry.tsx
        │   ├── admin/          # super-admin screens
        │   ├── tenant/         # tenant-admin screens
        │   └── shared/         # 404, error
        └── types/
            └── api.ts          # typed request/response shapes
```

---

## 7. Day-by-day plan

### Day 1 — Foundation (8h)
**Goal:** App boots, can log in, JWT works, RLS enforced, basic shell UI.

Backend (4h):
1. Maven project scaffold (`pom.xml`, `EvRentalApplication`, `application.yml`, `application-local.yml`).
2. `docker-compose.yml` with postgres:16 + mailhog.
3. Flyway migrations `V1__init_core.sql` through `V7__rls_policies.sql`.
4. `config/` package: `SecurityConfig`, `JwtConfig`, `OpenApiConfig`, `CorsConfig`.
5. `tenant/` package: `TenantContext`, `TenantFilter`, `RLSInterceptor`.
6. `auth/` package: `AuthController`, `JwtService`, `RefreshTokenService`, `UserDetailsService`.
7. `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` working.
8. Seed: 1 super-admin user, 2 demo tenants with 1 admin each.

Frontend (4h, parallel):
1. Vite + React + TS scaffold, Tailwind, shadcn/ui init.
2. `lib/api.ts` axios instance with refresh interceptor.
3. `lib/auth.ts` token storage.
4. `context/AuthContext.tsx`.
5. Router with public routes (`/login`, `/inquiry`) and protected `/app/**`.
6. Login page UI, forgot-password page UI.
7. Protected layout shell (sidebar + topbar, role-aware menu, placeholder dashboard).
8. Inquiry form page (public, posts to `/api/public/inquiries`).

**End-of-day demo:** Boot backend, run frontend, log in as super-admin → see shell. Log in as tenant admin → see shell. Submit inquiry form. Verify in DB.

### Day 2 — Core modules (8h)
**Goal:** Bikes, riders, rentals, payments, blacklist all CRUD + flows.

Backend (4h):
1. `platform/` package: `TenantController`, `PlanController`, `InquiryController`, `AnalyticsController`.
2. `tenantadmin/` package: `BikeController`, `RiderController`, `RentalController`, `PaymentController`, `BlacklistController`, `StaffController`.
3. DTOs, validation (`@Valid`), pagination.
4. `notification/` package: `EmailService` (uses MailHog in local), `NotificationEvent` types.
5. `shared/` package: `SharedBlacklistController`.
6. Audit log interceptor (logs CREATE/UPDATE/DELETE/BLOCK).
7. Tests: critical paths (auth, tenant isolation, payment overdue calculation).

Frontend (4h, parallel):
1. TanStack Query hooks per resource (`useBikes`, `useRiders`, `useRentals`, `usePayments`).
2. `pages/admin/`: Tenants list/detail/create, Plans list/create, Inquiries list/detail, Platform Analytics.
3. `pages/tenant/`: Dashboard, Bikes (list/create/edit), Riders (list/create/edit), Rentals (list/book/assign/return), Payments (list/record), Blacklist, Staff, Tenant Analytics.
4. Forms with Zod validation, error toasts.
5. Reusable DataTable component (sort, paginate, search).

**End-of-day demo:** Full tenant admin flow: create tenant → add bikes → add riders → book rental → record payment → see analytics update. Block a rider, verify shared.

### Day 3 — Polish, dashboards, Excel, integration (8h)
**Goal:** Demo-ready. All screens working end-to-end. Excel import works.

Backend (3h):
1. `excel/` package: `BikeImporter` (`/api/tenant/bikes/import`), `RiderImporter`.
2. Analytics aggregation queries (revenue by week, overdue by tenant, fleet utilization).
3. Email notifications: welcome email on tenant creation, payment receipt, overdue reminder (cron `@Scheduled`).
4. OpenAPI spec export to `docs/openapi.yaml`.
5. Dockerfile for backend.
6. Integration tests (Testcontainers): one happy-path per role.

Frontend (3h, parallel):
1. Super-admin dashboard with platform KPIs (revenue chart, tenant growth, top tenants).
2. Tenant-admin dashboard (active rentals, overdue payments, fleet utilization, weekly revenue chart).
3. Excel upload UI (drag-drop, preview, confirm).
4. Empty states, loading skeletons, error boundaries.
5. Responsive pass on dashboard layouts (desktop-first, tablet acceptable).

Integration + cleanup (2h, together):
1. End-to-end smoke: docker-compose up → run migrations → seed → log in each role → full demo flow.
2. README with quickstart.
3. Fix any drift found between API contract and implementation.
4. Commit, tag `phase-1-complete`.

---

## 8. Risks & cut list (Phase 1 won't have)

**Skipped (out of scope):**
- Rider mobile app (web admin only)
- Real payment gateway integration (manual recording only)
- SMS / WhatsApp notifications (email only)
- Production deployment (Dockerfile ready, but not deployed)
- Multi-language (English only)
- Comprehensive test coverage (~40% critical path coverage is the bar)
- Real-time GPS tracking UI (data model has `battery_level` placeholder, no live feed)
- File uploads (no profile photos, no documents)
- Webhooks / 3rd-party integrations

**Risks that will derail if not handled:**
| Risk | Mitigation |
|---|---|
| API contract drift | §4 is locked. Any change updates this doc + pings group. |
| RLS misconfiguration | V7 migration explicitly enables + creates policies. Verify with a 2-tenant seed. |
| Multi-tenancy leak | TenantContext is set in filter, never trust client-side tenant_id. |
| Weekly cycle bugs | Use date-fns `startOfWeek` (Mon) consistently; write unit test for boundary dates. |
| JWT refresh loop | Refresh interceptor must handle 401 once, not infinite. |
| Seeded passwords leaked | Use `bcrypt` with documented seed passwords (`admin@ev.com` / `Admin@123` for super-admin, doc in README). |

---

## 9. Day 1 kickoff prompts

### Backend worker (Claude Code, Opus)
```
You are building Phase 1 of the EV Rental Platform backend.

READ FIRST (mandatory):
- /Users/sumukhmk/Documents/GitHub/EV-APP/docs/PHASE_1_PLAN.md (the locked plan)

TODAY'S SCOPE (Day 1):
1. Maven scaffold at backend/ (Spring Boot 3.3, Java 21)
2. docker-compose.yml at repo root (postgres:16 + mailhog)
3. Flyway migrations V1 through V7 from §3 of the plan
4. Security + JWT config, auth controller (login/refresh/me)
5. Multi-tenancy: TenantContext + filter + RLS interceptor
6. Seed: 1 super-admin, 2 demo tenants, 2 plans, 1 tenant-admin per tenant
7. application.yml + application-local.yml with postgres + mail config

HARD CONSTRAINTS:
- Use UUID primary keys everywhere
- Every domain table needs tenant_id column from day 1 (even if not all used yet)
- Use springdoc-openapi for /swagger-ui.html
- BCrypt for passwords
- No Redis, no RabbitMQ, no S3

VERIFY before reporting done:
- `mvn clean compile` exits 0
- `mvn test` passes
- `docker-compose up -d` starts postgres + mailhog
- `mvn spring-boot:run` starts app, /actuator/health returns 200
- curl: POST /api/auth/login with seeded super-admin returns access+refresh
- curl: GET /api/auth/me with token returns user JSON
- Two tenants seeded, RLS verified: query as tenant A doesn't see tenant B rows

RETURN:
- List of files created
- Output of `mvn clean compile`
- Output of `mvn test`
- Curl commands + outputs for login + me
- Any deviations from PHASE_1_PLAN.md (with reason)
- Any blockers

If you hit a blocker that requires user input, stop and report it. Do NOT silently change the contract.
```

### Frontend worker (GitHub Copilot, Opus-tier)
```
You are building Phase 1 of the EV Rental Platform frontend.

READ FIRST (mandatory):
- /Users/sumukhmk/Documents/GitHub/EV-APP/docs/PHASE_1_PLAN.md (the locked plan)

TODAY'S SCOPE (Day 1):
1. Vite + React 18 + TypeScript 5 (strict) at frontend/
2. Tailwind 3 + shadcn/ui (init: button, input, label, form, dialog, dropdown-menu, table, card, sonner)
3. React Router 6 with routes:
   - /login (public)
   - /forgot-password (public)
   - /inquiry (public)
   - /app/** (protected, role-aware shell)
   - /admin/** (protected, super-admin only)
4. lib/api.ts: axios instance with request interceptor (attach JWT) + response interceptor (refresh on 401, single retry)
5. lib/auth.ts: token storage (localStorage for Phase 1), refresh logic
6. context/AuthContext.tsx: current user, login(), logout(), role check helpers
7. Login page UI: email + password + forgot link
8. Protected layout: sidebar (role-aware menu) + topbar (user dropdown, logout) + content slot
9. Empty Dashboard page placeholder
10. .env.example with VITE_API_BASE_URL

HARD CONSTRAINTS:
- TypeScript strict mode ON, no `any` in shared types
- shadcn/ui components only (no MUI, no Chakra)
- API base URL from env, not hardcoded
- Token in localStorage (not cookie) — Phase 1 acceptable, flagged in code comment

VERIFY before reporting done:
- `npm run dev` starts on :5173, page loads
- /login renders, can submit (backend may not exist yet — mock the API call)
- After "login", redirect to /app
- /app shell renders sidebar with role-aware items
- Logout clears token, redirects to /login
- npm run build exits 0
- tsc --noEmit exits 0

RETURN:
- List of files created
- npm run build output (tail)
- tsc --noEmit output
- Screenshot path or description of login + dashboard shell
- Any deviations from PHASE_1_PLAN.md (with reason)
- Any blockers

If you hit a blocker that requires user input, stop and report it. Do NOT silently change the contract.
```

---

## 10. Definition of done (Day 3 end)

- [ ] `docker-compose up -d && mvn spring-boot:run` starts backend cleanly
- [ ] `npm run dev` (or built `npm run preview`) starts frontend cleanly
- [ ] Super-admin can: log in, list/create tenants, list/create plans, respond to inquiry, see platform analytics
- [ ] Tenant-admin can: log in, manage bikes, manage riders, book rental, record payment, view blacklist, see analytics
- [ ] Public inquiry form works without login
- [ ] Two tenants seeded, RLS verified — tenant A cannot see tenant B's data via API
- [ ] Excel upload works for bikes
- [ ] Email notification fires (visible in MailHog UI)
- [ ] Overdue payments flagged correctly using Mon-Sun week boundary
- [ ] Shared blacklist: tenant A blocks rider → tenant B sees them
- [ ] README documents quickstart, seed credentials, demo flow
- [ ] All work committed on `phase-1-scaffold` branch

---

**This document is the contract. If you change a request/response shape, a table column, or a route — update this file first, then change code, then commit both together.**
