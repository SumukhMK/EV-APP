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

## 5. Module ownership (1/4 Abhiram, 3/4 SMK)

### SMK (you) — 75% of work
**Tool:** Claude Code (Opus) for backend, Copilot (Opus-tier) for frontend.

**Owns:**
- `backend/**`
- `db/migration/**`
- `docker-compose.yml`
- `frontend/src/pages/admin/**` — super-admin app (~10 screens)
- `frontend/src/pages/tenant/**` — tenant-admin app (~15 screens, the heavy one)
- `frontend/src/components/layout/**` — dashboard shells (sidebar + topbar) for both apps
- `frontend/src/components/forms/**` — app-specific forms (record payment, book rental, block rider, etc.)
- Day 3 integration, analytics dashboards, API integration with Abhiram's foundation

**Doesn't touch:**
- `frontend/src/components/ui/**`, `frontend/src/lib/**`, `frontend/src/context/**`, `frontend/src/hooks/**`, `frontend/src/types/**` (Abhiram's foundation)

### Abhiram — 25% of work
**Tool:** GitHub Copilot (Opus-tier, Business plan).

**Owns (frontend foundation, fully isolated folders):**
- `frontend/src/components/ui/**` — shadcn primitives (button, input, label, form, dialog, dropdown-menu, table, card, sonner) + custom shared components (DataTable, FormField, EmptyState, LoadingSpinner, StatusBadge, ConfirmDialog)
- `frontend/src/lib/**` — `api.ts` (axios + interceptors), `auth.ts` (token storage + refresh), `queryClient.ts` (TanStack Query setup), `utils.ts` (cn helper, formatters)
- `frontend/src/context/**` — `AuthContext.tsx`
- `frontend/src/hooks/**` — `useAuth.ts`, `useDebounce.ts`, `useToast.ts`, `usePagination.ts`
- `frontend/src/types/**` — shared TS types mirroring API request/response shapes from §4
- `frontend/src/pages/public/**` — Landing, Inquiry, Login, ForgotPassword, ResetPassword, NotFound

**Doesn't touch:**
- `backend/**`, `db/**`, `docker-compose.yml`, anything in `pages/admin/**` or `pages/tenant/**`

### Coordination rule (the seam)
**The API contract in §4 is the only contract.** Abhiram's `types/` folder must mirror it. If you need a new shared component, hook, or type, **add it to your own folder** (or open a PR to Abhiram's foundation — but don't edit his files without his sign-off).

### Day 1 ordering
1. **Abhiram** starts foundation work immediately — `lib/`, `ui/`, `context/`, `hooks/`, `types/`, `public/` pages.
2. **You** start backend in parallel — `backend/`, `db/migration/`, `docker-compose.yml`, auth endpoints.
3. By end of Day 1: Abhiram's foundation is done. Your backend has auth + RLS + seed data.
4. Day 2 onwards: You consume Abhiram's foundation (`useAuth`, DataTable, FormField, types) to build the admin apps. If something's missing, add it to your own folder locally — don't block on Abhiram.

### Day 3 (Abhiram is free)
Abhiram's 25% is complete by end of Day 1. He's free from Day 2 onwards. If he wants to help, optional extras: write a few component tests, polish the inquiry form, write the README. But his core deliverable is locked.

---

## 6. File tree

**Legend:** `[S]` = SMK (you, 75%), `[A]` = Abhiram (25%), `[both]` = either, just don't conflict.

```
EV-APP/
├── docker-compose.yml                          [S]
├── .env.example                                [S]
├── .gitignore                                  [both]
├── README.md                                   [both]
├── docs/
│   ├── BUILD.md                                [both — done]
│   ├── PHASE_1_PLAN.md                         [both — locked]
│   ├── openapi.yaml                            [S]
│   └── 19 02:54  - Notes by Gemini.pdf          [both]
├── backend/                                    [S]
│   ├── pom.xml
│   ├── Dockerfile
│   ├── src/main/java/com/evrental/
│   │   ├── EvRentalApplication.java
│   │   ├── config/        (security, jwt, cors, openapi)
│   │   ├── tenant/        (TenantContext, filter, RLS enable)
│   │   ├── auth/          (login, refresh, me, password reset)
│   │   ├── platform/      (super-admin: tenants, plans, inquiries, analytics)
│   │   ├── tenantadmin/   (bikes, riders, rentals, payments, blacklist, staff)
│   │   ├── shared/        (shared blacklist read)
│   │   ├── notification/  (email service only)
│   │   ├── excel/         (xlsx importer)
│   │   └── common/        (exceptions, dto, util)
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
│   │       ├── V7__rls_policies.sql
│   │       └── V8__seed_demo.sql
│   └── src/test/java/...
└── frontend/                                   [mixed — see below]
    ├── package.json                            [A]
    ├── vite.config.ts                          [A]
    ├── tsconfig.json                           [A]
    ├── tailwind.config.js                      [A]
    ├── postcss.config.js                       [A]
    ├── index.html                              [A]
    ├── Dockerfile                              [S]
    ├── .env.example                            [A]
    └── src/
        ├── main.tsx                            [A]
        ├── App.tsx                             [A]
        ├── router.tsx                          [A]   (only public routes)
        ├── lib/                                [A]
        │   ├── api.ts
        │   ├── auth.ts
        │   ├── queryClient.ts
        │   └── utils.ts
        ├── context/                            [A]
        │   └── AuthContext.tsx
        ├── hooks/                              [A]
        │   ├── useAuth.ts
        │   ├── useDebounce.ts
        │   ├── useToast.ts
        │   └── usePagination.ts
        ├── types/                              [A]
        │   └── api.ts
        ├── components/
        │   ├── ui/                             [A]   (shadcn + DataTable, FormField, EmptyState, StatusBadge, ConfirmDialog, LoadingSpinner)
        │   ├── layout/                         [S]   (DashboardShell, AdminShell, TenantShell, Sidebar, Topbar)
        │   └── forms/                          [S]   (RecordPaymentForm, BookRentalForm, BlockRiderForm, etc.)
        └── pages/
            ├── public/                         [A]
            │   ├── Landing.tsx
            │   ├── Inquiry.tsx
            │   ├── Login.tsx
            │   ├── ForgotPassword.tsx
            │   ├── ResetPassword.tsx
            │   └── NotFound.tsx
            ├── admin/                          [S]   (super-admin screens)
            └── tenant/                         [S]   (tenant-admin screens)
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
**Abhiram:** done after Day 1, his 25% complete. (He can optionally help on extras but his core scope is locked.)
**SMK:** solo work today.

Backend (4h):
1. `platform/` package: `TenantController`, `PlanController`, `InquiryController`, `AnalyticsController`.
2. `tenantadmin/` package: `BikeController`, `RiderController`, `RentalController`, `PaymentController`, `BlacklistController`, `StaffController`.
3. DTOs, validation (`@Valid`), pagination.
4. `notification/` package: `EmailService` (uses MailHog in local), `NotificationEvent` types.
5. `shared/` package: `SharedBlacklistController`.
6. Audit log interceptor (logs CREATE/UPDATE/DELETE/BLOCK).
7. Tests: critical paths (auth, tenant isolation, payment overdue calculation).

Frontend (4h):
1. TanStack Query hooks per resource (`useBikes`, `useRiders`, `useRentals`, `usePayments`) — own folder, NOT in Abhiram's hooks/.
2. `components/layout/`: `DashboardShell`, `AdminShell`, `TenantShell`, `Sidebar` (role-aware), `Topbar` (user dropdown, logout).
3. `pages/admin/`: Tenants list/detail/create, Plans list/create, Inquiries list/detail, Platform Analytics stub.
4. `pages/tenant/`: Dashboard stub, Bikes (list/create/edit), Riders (list/create/edit), Rentals (list/book/assign/return), Payments (list/record), Blacklist, Staff, Tenant Analytics stub.
5. Forms in `components/forms/`: `RecordPaymentForm`, `BookRentalForm`, `BlockRiderForm`, `CreateTenantForm`, etc. using Abhiram's FormField + shadcn.
6. Consume Abhiram's DataTable, FormField, EmptyState, StatusBadge throughout.

**End-of-day demo:** Full tenant admin flow: create tenant → add bikes → add riders → book rental → record payment → see analytics update. Block a rider, verify shared.

### Day 3 — Polish, dashboards, Excel, integration (8h)
**Goal:** Demo-ready. All screens working end-to-end. Excel import works.
**SMK:** solo work today.

Backend (3h):
1. `excel/` package: `BikeImporter` (`/api/tenant/bikes/import`), `RiderImporter`.
2. Analytics aggregation queries (revenue by week, overdue by tenant, fleet utilization).
3. Email notifications: welcome email on tenant creation, payment receipt, overdue reminder (cron `@Scheduled`).
4. OpenAPI spec export to `docs/openapi.yaml`.
5. Dockerfile for backend.
6. Integration tests (Testcontainers): one happy-path per role.

Frontend (3h):
1. Super-admin dashboard with platform KPIs (revenue chart, tenant growth, top tenants).
2. Tenant-admin dashboard (active rentals, overdue payments, fleet utilization, weekly revenue chart).
3. Excel upload UI (drag-drop, preview, confirm).
4. Empty states, loading skeletons, error boundaries.
5. Responsive pass on dashboard layouts (desktop-first, tablet acceptable).

Integration + cleanup (2h):
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

### Worker A: SMK — Backend (Claude Code, Opus)
```
You are building Phase 1 of the EV Rental Platform backend. Owner: SMK.

READ FIRST (mandatory):
- /Users/sumukhmk/Documents/GitHub/EV-APP/docs/PHASE_1_PLAN.md (the locked plan)

YOUR FILES (only edit these):
- backend/**
- db/migration/** (under backend/src/main/resources/)
- docker-compose.yml (at repo root)
- backend/pom.xml
- backend/Dockerfile (skip if no time on Day 1)

NOT YOUR FILES:
- frontend/** (Abhiram is doing this)
- docs/** (plan is locked)

TODAY'S SCOPE (Day 1):
1. Maven scaffold at backend/ (Spring Boot 3.3, Java 21, group com.evrental)
2. docker-compose.yml at repo root (postgres:16 + mailhog, ports 5432 + 1025/8025)
3. Flyway migrations V1 through V7 from §3 of the plan — implement all of them
4. Security + JWT config (jjwt 0.12), auth controller (POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me)
5. Multi-tenancy: TenantContext (ThreadLocal), OncePerRequestFilter to extract JWT and set context, RLS interceptor that calls `SET LOCAL app.tenant_id`
6. Seed via Flyway `V8__seed_demo.sql`: 1 super-admin (admin@ev.com / Admin@123), 2 plans (Starter, Growth), 2 tenants, 2 tenant-admins (admin@greenfleet.com, admin@cityride.com / Tenant@123)
7. application.yml + application-local.yml with postgres + mail config

HARD CONSTRAINTS:
- UUID primary keys everywhere (`uuid` type, not `varchar`)
- Every domain table needs `tenant_id` column from day 1
- Use springdoc-openapi for /swagger-ui.html
- BCrypt for passwords (use Spring Security's BCryptPasswordEncoder)
- No Redis, no RabbitMQ, no S3 — use @Async + ThreadPoolTaskExecutor for notifications
- Refresh tokens stored in DB (refresh_tokens table), not stateless

VERIFY before reporting done:
- `mvn clean compile` exits 0
- `mvn test` exits 0
- `docker-compose up -d` starts postgres + mailhog cleanly
- `mvn spring-boot:run` starts app, /actuator/health returns 200
- `curl -X POST http://localhost:8080/api/auth/login -d '{"email":"admin@ev.com","password":"Admin@123"}' -H 'Content-Type: application/json'` returns access+refresh tokens
- `curl http://localhost:8080/api/auth/me -H "Authorization: Bearer <token>"` returns super-admin user JSON
- RLS verification: log in as tenant A admin, query a list endpoint, see only tenant A's rows (use 2 seeded tenants to prove this)

RETURN:
- List of files created
- Output of `mvn clean compile`
- Output of `mvn test`
- Curl commands + outputs for login + me + RLS proof
- Any deviations from PHASE_1_PLAN.md (with reason)
- Any blockers

If you hit a blocker that requires user input, stop and report it. Do NOT silently change the contract.
```

### Worker B: Abhiram — Frontend foundation (Copilot, Opus-tier)
```
You are building the frontend foundation for Phase 1 of the EV Rental Platform. Owner: Abhiram.

READ FIRST (mandatory):
- /Users/sumukhmk/Documents/GitHub/EV-APP/docs/PHASE_1_PLAN.md (the locked plan)

YOUR FILES (only edit these — strict):
- frontend/src/components/ui/**
- frontend/src/lib/**
- frontend/src/context/**
- frontend/src/hooks/**
- frontend/src/types/**
- frontend/src/pages/public/**
- frontend/package.json
- frontend/vite.config.ts
- frontend/tsconfig.json
- frontend/tailwind.config.js
- frontend/postcss.config.js
- frontend/index.html
- frontend/src/main.tsx
- frontend/src/App.tsx
- frontend/src/router.tsx
- frontend/.env.example

NOT YOUR FILES:
- backend/**, db/**, docker-compose.yml
- frontend/src/pages/admin/** (SMK is building the super-admin app)
- frontend/src/pages/tenant/** (SMK is building the tenant-admin app)
- frontend/src/components/layout/** (SMK is building dashboard shells)
- frontend/src/components/forms/** (SMK is building app-specific forms)
- docs/** (plan is locked)

TODAY'S SCOPE (Day 1) — the foundation:

1. Vite + React 18 + TypeScript 5 (strict mode ON) at frontend/
2. Tailwind 3 + shadcn/ui init (button, input, label, form, dialog, dropdown-menu, table, card, sonner, badge, separator, skeleton)
3. Custom shared components in components/ui/:
   - DataTable (sortable headers, pagination, search, empty state, loading state)
   - FormField (label + input + error message wrapper)
   - EmptyState (icon + title + description + action slot)
   - StatusBadge (color-coded by status string)
   - ConfirmDialog (uses Dialog primitive)
   - LoadingSpinner / PageLoader
4. lib/:
   - api.ts (axios instance, baseURL from VITE_API_BASE_URL, request interceptor attaches JWT, response interceptor does single-retry on 401 with refresh)
   - auth.ts (token storage in localStorage, getAccessToken, setTokens, clearTokens, refresh logic)
   - queryClient.ts (TanStack Query QueryClient with sensible defaults)
   - utils.ts (cn helper from shadcn, formatters for currency/date/phone)
5. context/AuthContext.tsx: current user state, login(email, password), logout(), hasRole(role), hasPermission(perm), loading state
6. hooks/:
   - useAuth() (returns AuthContext)
   - useDebounce<T>(value, delay)
   - useToast() (sonner wrapper)
   - usePagination() (returns { page, size, setPage, setSize })
7. types/api.ts: TypeScript types mirroring ALL API request/response shapes from §4 of the plan. Use the exact field names. Export types like: LoginRequest, LoginResponse, User, Tenant, Plan, Bike, Rider, Rental, Payment, Inquiry, PageResponse<T>, ApiError
8. pages/public/:
   - Landing.tsx (hero + features + CTA to /inquiry and /login)
   - Inquiry.tsx (form: company, contact, email, phone, city, fleet size, message — posts to /api/public/inquiries)
   - Login.tsx (email + password + forgot link, calls AuthContext.login, redirects to /app)
   - ForgotPassword.tsx (email input, posts to /api/auth/forgot-password)
   - ResetPassword.tsx (token from URL + new password, posts to /api/auth/reset-password)
   - NotFound.tsx (404)
9. router.tsx: react-router-dom with these routes only:
   - / (Landing)
   - /inquiry (Inquiry)
   - /login (Login)
   - /forgot-password (ForgotPassword)
   - /reset-password (ResetPassword)
   - /* (NotFound)
   - NOTE: do NOT add /app/**, /admin/**, /tenant/** — SMK owns those layouts
10. main.tsx, App.tsx: wire QueryClientProvider, AuthProvider, RouterProvider, Toaster (sonner)

HARD CONSTRAINTS:
- TypeScript strict mode ON, no `any` in shared types
- shadcn/ui components only (no MUI, no Chakra)
- API base URL from env (VITE_API_BASE_URL=http://localhost:8080/api), not hardcoded
- Token in localStorage (not cookie) — Phase 1 acceptable, add code comment flagging this
- All API types in types/api.ts must match §4 exactly — this is the contract SMK consumes
- Component props must be well-typed (no `any`)

VERIFY before reporting done:
- `npm install` succeeds
- `npm run dev` starts on :5173, Landing page renders
- /login renders the form
- /inquiry renders the form (validation works with Zod)
- npm run build exits 0
- tsc --noEmit exits 0 (strict mode clean)
- Manually test: type in login form, click submit (will fail since backend not up — that's OK, mock it locally or just verify no JS errors)
- Manually test: DataTable renders with mock data (write a small story or demo page that shows DataTable with 5 fake rows)
- Manually test: FormField works with label + input + error

RETURN:
- List of files created (per folder)
- npm run build output (tail, last 20 lines)
- tsc --noEmit output
- Screenshot path or description of Landing + Login + DataTable demo
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
