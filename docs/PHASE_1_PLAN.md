# Phase 1 Plan — EV Rental Platform

**Status:** Locked. Do not change mid-sprint without explicit user (SMK) approval.
**Branch:** `phase-1-scaffold`
**Duration:** 3 days
**Quality bar:** MVP-grade, demo-ready, not production-hardened.

---

## Table of Contents

0. [How to use this doc](#0-how-to-use-this-doc)
1. [Overview](#1-overview)
2. [Stack (locked)](#2-stack-locked)
3. [Repository layout](#3-repository-layout)
4. [Setup](#4-setup)
5. [Conventions](#5-conventions)
6. [API contract](#6-api-contract)
7. [Shared component specs (Abhiram's deliverables)](#7-shared-component-specs)
8. [Routes and pages](#8-routes-and-pages)
9. [TypeScript types — the contract](#9-typescript-types--the-contract)
10. [Day-by-day plan](#10-day-by-day-plan)
11. [Acceptance criteria — Definition of Done](#11-acceptance-criteria--definition-of-done)
12. [Kickoff prompts (paste into your tool)](#12-kickoff-prompts-paste-into-your-tool)

---

## 0. How to use this doc

**If you are Abhiram (Cursor):**
1. Clone the repo: `git clone <url> && cd EV-APP && git checkout phase-1-scaffold`
2. Open in Cursor.
3. Open this file in a tab.
4. When you start work, in Cursor's chat panel type `@PHASE_1_PLAN.md` to attach the whole doc, then paste the **Worker B kickoff prompt** from §12.
5. For multi-file edits, use Composer (`Cmd+I` / `Ctrl+I`) and reference this doc the same way.
6. After each batch of changes, run `npm run typecheck` and `npm run build` before reporting done.
7. Commit your work to `phase-1-scaffold` with the message format in §5.

**If you are SMK (Claude Code):**
1. Same repo, same branch.
2. Open this doc in your tool of choice.
3. In your chat, paste the **Worker A kickoff prompt** from §12.
4. After each batch of changes, run `mvn clean compile` and `mvn test`.
5. Commit to `phase-1-scaffold` with the message format in §5.

**Do not edit this doc without explicit approval from SMK.** It is the contract. If you find something wrong or missing, write it down in your report — do not silently change the spec.

---

## 1. Overview

We are building Phase 1 of an EV Rental Platform for a fleet operator (currently 150 e-bikes, scaling to 1000+). Phase 1 replaces today's paper register + Excel sheets with a multi-tenant admin web app.

**Three user roles:**
- **Super Admin** (platform owner) — manages tenants, plans, sees platform analytics.
- **Tenant Admin** (fleet company owner) — manages their own bikes, riders, rentals, payments, staff.
- **Tenant Staff** (fleet employee) — read-only on most things, can record payments.

**Out of scope for Phase 1:** Rider mobile app, real SMS/WhatsApp (email only via MailHog), payment gateway integration, production deployment, file uploads, multi-language.

---

## 2. Stack (locked)

### Backend (SMK)

| Tool | Version | Notes |
|---|---|---|
| Java | 21 (LTS) | |
| Spring Boot | 3.3.x | |
| Build | Maven | not Gradle |
| Database | PostgreSQL 16 | via Docker Compose locally |
| Migrations | Flyway | `backend/src/main/resources/db/migration/V*.sql` |
| Auth | Spring Security + JWT (jjwt 0.12) | access token (15 min) + refresh token (7 days) |
| Email | spring-boot-starter-mail + MailHog | SMTP for notifications, no real provider |
| Excel | Apache POI 5.x | `.xlsx` import only |
| API docs | springdoc-openapi 2.x | served at `/swagger-ui.html` |
| Tests | JUnit 5, Testcontainers (postgres) | critical paths only |

**Cut from Phase 1:** Redis, RabbitMQ (use `@Async` + `ThreadPoolTaskExecutor`), S3 / file storage, SMS / WhatsApp, Sentry / observability, Kafka.

### Frontend (Abhiram + SMK)

| Tool | Version | Notes |
|---|---|---|
| Node | 20 LTS | |
| Framework | React | 18 |
| Build | Vite | 5 |
| Language | TypeScript | 5, strict mode ON |
| Routing | React Router | 6 |
| Server state | TanStack Query | 5 |
| Forms | React Hook Form + Zod | |
| HTTP | axios + interceptors | refresh-token rotation |
| UI primitives | shadcn/ui + Tailwind 3 | Radix under the hood |
| Charts | Recharts | dashboards (SMK) |
| Icons | lucide-react | |
| Date | date-fns | |
| Toasts | sonner | via shadcn |

**Cut from Phase 1:** Storybook, Playwright E2E tests, i18n, service worker / PWA.

### Infra

- `docker-compose.yml` at repo root: `postgres:16` + `mailhog`.
- No Redis, no RabbitMQ in compose.
- Backend Dockerfile at `backend/Dockerfile`.
- Frontend Dockerfile at `frontend/Dockerfile` (added by SMK on Day 3).

---

## 3. Repository layout

**Legend:** `[S]` = SMK owns, `[A]` = Abhiram owns, `[both]` = either, no conflict.

```
EV-APP/
├── docker-compose.yml                              [S]
├── .env.example                                    [S]
├── .gitignore                                      [both]
├── README.md                                       [S]   (written Day 3)
├── docs/
│   ├── BUILD.md                                    [both] — product overview (done)
│   ├── PHASE_1_PLAN.md                             [both] — this file, locked
│   ├── openapi.yaml                                [S]   — generated from backend
│   └── 19 02:54  - Notes by Gemini.pdf              [both]
├── backend/                                        [S]
│   ├── pom.xml
│   ├── Dockerfile
│   ├── src/main/java/com/evrental/
│   │   ├── EvRentalApplication.java
│   │   ├── config/        — SecurityConfig, JwtConfig, OpenApiConfig, CorsConfig
│   │   ├── tenant/        — TenantContext, TenantFilter, RlsInterceptor
│   │   ├── auth/          — AuthController, JwtService, RefreshTokenService, UserDetailsService
│   │   ├── platform/      — super-admin: tenants, plans, inquiries, analytics
│   │   ├── tenantadmin/   — bikes, riders, rentals, payments, blacklist, staff
│   │   ├── shared/        — shared blacklist read
│   │   ├── notification/  — EmailService only
│   │   ├── excel/         — BikeImporter, RiderImporter
│   │   └── common/        — exceptions, dto, util
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   ├── application-local.yml
│   │   └── db/migration/
│   │       ├── V1__init_core.sql          — tenants, plans, users, refresh_tokens, subscriptions
│   │       ├── V2__bikes_riders.sql       — bikes, riders tables + indexes
│   │       ├── V3__rentals_payments.sql   — rentals, payments tables + indexes
│   │       ├── V4__blacklist_inquiries.sql — blacklist_shared, inquiries, audit_logs
│   │       ├── V5__rls_policies.sql       — enable RLS + create policies
│   │       └── V6__seed_demo.sql          — 1 super-admin, 2 plans, 2 tenants, 2 tenant-admins
│   └── src/test/java/...
└── frontend/                                       [mixed]
    ├── package.json                                [A]
    ├── vite.config.ts                              [A]
    ├── tsconfig.json                               [A]
    ├── tailwind.config.js                          [A]
    ├── postcss.config.js                           [A]
    ├── components.json                             [A]   (shadcn config)
    ├── index.html                                  [A]
    ├── .env.example                                [A]
    ├── Dockerfile                                  [S]
    └── src/
        ├── main.tsx                                [A]
        ├── App.tsx                                 [A]
        ├── router.tsx                              [A]   (only public routes — see §8)
        ├── lib/                                    [A]
        │   ├── api.ts
        │   ├── auth.ts
        │   ├── queryClient.ts
        │   └── utils.ts
        ├── context/                                [A]
        │   └── AuthContext.tsx
        ├── hooks/                                  [A]
        │   ├── useAuth.ts
        │   ├── useDebounce.ts
        │   ├── useToast.ts
        │   └── usePagination.ts
        ├── types/                                  [A]
        │   └── api.ts
        ├── components/
        │   ├── ui/                                 [A]   shadcn + custom (see §7)
        │   │   ├── button.tsx
        │   │   ├── input.tsx
        │   │   ├── label.tsx
        │   │   ├── form.tsx
        │   │   ├── dialog.tsx
        │   │   ├── dropdown-menu.tsx
        │   │   ├── table.tsx
        │   │   ├── card.tsx
        │   │   ├── badge.tsx
        │   │   ├── separator.tsx
        │   │   ├── skeleton.tsx
        │   │   ├── sonner.tsx
        │   │   ├── DataTable.tsx                   — custom
        │   │   ├── FormField.tsx                   — custom
        │   │   ├── EmptyState.tsx                  — custom
        │   │   ├── StatusBadge.tsx                 — custom
        │   │   ├── ConfirmDialog.tsx               — custom
        │   │   └── PageLoader.tsx                  — custom
        │   ├── layout/                             [S]   — DashboardShell, AdminShell, TenantShell, Sidebar, Topbar
        │   └── forms/                              [S]   — RecordPaymentForm, BookRentalForm, BlockRiderForm, etc.
        └── pages/
            ├── public/                             [A]
            │   ├── Landing.tsx
            │   ├── Inquiry.tsx
            │   ├── Login.tsx
            │   ├── ForgotPassword.tsx
            │   ├── ResetPassword.tsx
            │   └── NotFound.tsx
            ├── admin/                              [S]   super-admin screens
            └── tenant/                             [S]   tenant-admin screens
```

**Strict rule:** Never edit files outside your ownership column. If you need a shared component or hook that doesn't exist, write it locally in your own folder rather than touching the other person's files.

---

## 4. Setup

### Prerequisites

| Tool | Version | How to check |
|---|---|---|
| Node | 20 LTS | `node --version` |
| npm | 10+ | `npm --version` |
| Docker Desktop | latest | `docker --version` |
| Java | 21 | `java --version` |
| Maven | 3.9+ | `mvn --version` |
| Cursor | latest | n/a |

### Clone & install

```bash
git clone <repo-url>
cd EV-APP
git checkout phase-1-scaffold

# Backend (SMK only)
cd backend
mvn clean install
cd ..

# Frontend (Abhiram)
cd frontend
npm install
cd ..

# Infra (start postgres + mailhog)
docker-compose up -d
```

### Run

```bash
# Backend (SMK) — from /backend
mvn spring-boot:run

# Frontend (Abhiram) — from /frontend
npm run dev
```

Backend: http://localhost:8080
Frontend: http://localhost:5173
MailHog UI: http://localhost:8025
Postgres: localhost:5432 (user `ev`, pass `ev`, db `ev`)

### Environment variables

**Backend `application-local.yml` (SMK sets these in the file, not env):**
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/ev
    username: ev
    password: ev
  mail:
    host: localhost
    port: 1025
app:
  jwt:
    secret: <random-256-bit-string>
    access-ttl-minutes: 15
    refresh-ttl-days: 7
```

**Frontend `.env.local` (Abhiram creates from `.env.example`):**
```
VITE_API_BASE_URL=http://localhost:8080/api
```

### Seed credentials (created by V6 migration)

| Role | Email | Password | Tenant |
|---|---|---|---|
| Super Admin | admin@ev.com | Admin@123 | (none) |
| Tenant Admin | admin@greenfleet.com | Tenant@123 | GreenFleet |
| Tenant Admin | admin@cityride.com | Tenant@123 | CityRide |

---

## 5. Conventions

### File naming

- React components: `PascalCase.tsx` (e.g., `DataTable.tsx`)
- Hooks: `camelCase.ts` starting with `use` (e.g., `useDebounce.ts`)
- Utilities: `camelCase.ts` (e.g., `utils.ts`)
- Types: `camelCase.ts` (e.g., `api.ts`)
- SQL migrations: `V{n}__{snake_case_description}.sql` (e.g., `V5__rls_policies.sql`)
- Java classes: `PascalCase.java`, packages lowercase (e.g., `com.evrental.tenantadmin`)

### TypeScript style

- Strict mode is ON in `tsconfig.json`. No `any` in shared types.
- Prefer `interface` for object types, `type` for unions/aliases.
- Use `import type` for type-only imports.
- Exports from `lib/`, `types/`, `hooks/`, `components/ui/` are public API. Other folders can import but should not re-export.

### Java style

- Spring Boot conventions, constructor injection (no `@Autowired` field injection).
- Records for DTOs.
- `@Valid` on request bodies, `@NotNull` / `@NotBlank` on fields.
- Use `@RequiredArgsConstructor` for services with dependencies.

### Git workflow

- Branch: `phase-1-scaffold` (everyone works on this)
- Commit message format: `<scope>: <imperative summary>`
  - `backend: add JWT auth controller`
  - `frontend: scaffold shadcn ui primitives`
  - `docs: lock phase 1 plan`
- One logical change per commit. Don't bundle unrelated edits.
- Push to remote at end of each day.

### Definition of done (per deliverable)

A deliverable is done when:
1. Code compiles/builds (`mvn clean compile` for backend, `npm run build` for frontend)
2. Tests pass (`mvn test`, `npm run test` if any)
3. Manual smoke check passed (run dev server, exercise the flow)
4. No `any` cast sneaking past strict TS check
5. Commit message follows the format above
6. Pushed to `phase-1-scaffold`

---

## 6. API contract

**Base path:** `/api`
**Auth header:** `Authorization: Bearer <accessToken>` (except where noted)
**Content type:** `application/json`

### Pagination (all list endpoints)

Query: `?page=0&size=20&sort=createdAt,desc`
Response:
```ts
interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
```

### Error shape (all error responses)

```ts
interface ApiError {
  error: {
    code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL';
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;  // ISO 8601
  };
}
```

### Public endpoints (no auth)

#### `POST /api/public/inquiries`
Submit fleet-owner inquiry form. Rate-limited (5/min per IP).

Request:
```ts
interface InquiryRequest {
  companyName: string;        // required, 2-200 chars
  contactName: string;        // required, 2-100 chars
  email: string;              // required, valid email
  phone: string;              // required, 10-15 digits
  city: string;               // required, 2-100 chars
  fleetSize: '1-10' | '10-50' | '50-200' | '200+';
  planInterest?: string;      // plan code, optional
  message?: string;           // optional, max 1000 chars
}
```
Response: `201 { id: string }`

#### `POST /api/auth/login`
Request:
```ts
interface LoginRequest {
  email: string;
  password: string;
}
```
Response: `200`
```ts
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
interface AuthUser {
  id: string;          // UUID
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_STAFF';
  tenantId: string | null;   // null for SUPER_ADMIN
  permissions: string[];
}
```

#### `POST /api/auth/refresh`
Request:
```ts
interface RefreshRequest {
  refreshToken: string;
}
```
Response: `200 LoginResponse` (with new tokens)

#### `POST /api/auth/logout`
Headers: requires auth.
Request: empty body.
Response: `204 No Content` (revokes the refresh token in DB).

#### `GET /api/auth/me`
Headers: requires auth.
Response: `200 AuthUser`

#### `POST /api/auth/forgot-password`
Request:
```ts
interface ForgotPasswordRequest {
  email: string;
}
```
Response: `202 Accepted` (always, even if email doesn't exist — no enumeration).

#### `POST /api/auth/reset-password`
Request:
```ts
interface ResetPasswordRequest {
  token: string;
  newPassword: string;   // min 8 chars
}
```
Response: `204 No Content`

#### `GET /api/health`
Response: `200 { status: 'UP' }`

### Super-admin endpoints (`/api/admin/**`)
**Role required:** `SUPER_ADMIN`

#### Tenants
- `GET /api/admin/tenants?page=0&size=20&status=ACTIVE&planId={uuid}` → `200 PageResponse<Tenant>`
- `POST /api/admin/tenants` → `201 Tenant`
- `GET /api/admin/tenants/{id}` → `200 Tenant`
- `PATCH /api/admin/tenants/{id}` → `200 Tenant`
- `DELETE /api/admin/tenants/{id}` → `204` (soft delete, status → SUSPENDED)
- `POST /api/admin/tenants/{id}/impersonate` → `200 LoginResponse` (login as tenant admin, for support)

```ts
interface Tenant {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
  contactEmail: string;
  contactPhone: string;
  city: string;
  createdAt: string;
  updatedAt: string;
}
interface TenantCreateRequest {
  name: string;
  slug: string;             // unique, lowercase, alphanumeric+dash
  planId: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  adminEmail: string;       // creates the first tenant admin
  adminFullName: string;
  adminPassword: string;    // min 8 chars
}
interface TenantUpdateRequest {
  name?: string;
  planId?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
  contactEmail?: string;
  contactPhone?: string;
  city?: string;
}
```

#### Plans
- `GET /api/admin/plans` → `200 Plan[]`
- `POST /api/admin/plans` → `201 Plan`
- `PATCH /api/admin/plans/{id}` → `200 Plan`

```ts
interface Plan {
  id: string;
  code: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  name: string;
  priceMonthly: number;     // numeric, 2 decimal places
  maxBikes: number;
  maxRiders: number;
  maxStaff: number;
  features: string[];       // JSON array
  isActive: boolean;
}
interface PlanCreateRequest {
  code: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  name: string;
  priceMonthly: number;
  maxBikes: number;
  maxRiders: number;
  maxStaff: number;
  features: string[];
}
```

#### Inquiries
- `GET /api/admin/inquiries?page=0&size=20&status=NEW` → `200 PageResponse<Inquiry>`
- `PATCH /api/admin/inquiries/{id}` → `200 Inquiry`

```ts
interface Inquiry {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  fleetSize: '1-10' | '10-50' | '50-200' | '200+';
  planInterest: string | null;
  message: string | null;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'REJECTED' | 'CONVERTED';
  createdAt: string;
}
interface InquiryUpdateRequest {
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'REJECTED' | 'CONVERTED';
  notes?: string;
}
```

#### Analytics
- `GET /api/admin/analytics/platform` → `200 PlatformAnalytics`
```ts
interface PlatformAnalytics {
  tenantCount: number;
  activeTenantCount: number;
  bikeCount: number;
  activeRentalCount: number;
  totalRevenue: number;            // sum of all payments
  overdueAmount: number;           // sum of overdue payments
  newInquiriesCount: number;       // last 30 days
  topTenantsByRevenue: Array<{ tenantId: string; tenantName: string; revenue: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;  // last 6 months
}
```

#### Audit logs
- `GET /api/admin/audit-logs?page=0&size=50&tenantId={uuid}&actorUserId={uuid}` → `200 PageResponse<AuditLog>`
```ts
interface AuditLog {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}
```

### Tenant-scoped endpoints (`/api/tenant/**`)
**Role required:** `TENANT_ADMIN` or `TENANT_STAFF`
**Scope:** all data filtered by `tenant_id` from JWT. RLS enforced in DB.

#### Staff
- `GET /api/tenant/staff` → `200 User[]`
- `POST /api/tenant/staff` → `201 User` (ADMIN only)
- `PATCH /api/tenant/staff/{id}` → `200 User` (ADMIN only)
- `DELETE /api/tenant/staff/{id}` → `204` (ADMIN only, soft delete)

```ts
interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'TENANT_ADMIN' | 'TENANT_STAFF';
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
  createdAt: string;
}
```

#### Bikes
- `GET /api/tenant/bikes?page=0&size=20&status=AVAILABLE` → `200 PageResponse<Bike>`
- `POST /api/tenant/bikes` → `201 Bike`
- `GET /api/tenant/bikes/{id}` → `200 Bike`
- `PATCH /api/tenant/bikes/{id}` → `200 Bike`
- `DELETE /api/tenant/bikes/{id}` → `204`
- `POST /api/tenant/bikes/import` → `200 { imported: number; errors: string[] }` (multipart, xlsx)

```ts
interface Bike {
  id: string;
  model: string;
  registrationNumber: string;
  chassisNumber: string;
  status: 'AVAILABLE' | 'RENTED' | 'MAINTENANCE' | 'RETIRED';
  batteryLevel: number;     // 0-100
  currentRiderId: string | null;
  acquiredAt: string;       // ISO date
  createdAt: string;
  updatedAt: string;
}
interface BikeCreateRequest {
  model: string;
  registrationNumber: string;
  chassisNumber: string;
  batteryLevel?: number;    // default 100
  acquiredAt: string;       // ISO date
}
```

#### Riders
- `GET /api/tenant/riders?page=0&size=20&status=ACTIVE&search=phone_or_name` → `200 PageResponse<Rider>`
- `POST /api/tenant/riders` → `201 Rider`
- `GET /api/tenant/riders/{id}` → `200 Rider`
- `PATCH /api/tenant/riders/{id}` → `200 Rider`
- `POST /api/tenant/riders/{id}/block` → `200 Rider` (also adds to shared blacklist if isShared=true)
- `POST /api/tenant/riders/{id}/unblock` → `200 Rider`

```ts
interface Rider {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  aadhaarLast4: string | null;
  address: string | null;
  city: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'INACTIVE';
  blockedAt: string | null;
  blockReason: string | null;
  isOnSharedBlacklist: boolean;
  createdAt: string;
}
interface RiderCreateRequest {
  fullName: string;
  phone: string;
  email?: string;
  aadhaarLast4?: string;    // last 4 digits only, never store full
  address?: string;
  city?: string;
}
interface BlockRiderRequest {
  reason: string;
  isShared: boolean;        // if true, blocks across all tenants
}
```

#### Rentals
- `GET /api/tenant/rentals?page=0&size=20&status=ACTIVE&bikeId={uuid}&riderId={uuid}` → `200 PageResponse<Rental>`
- `POST /api/tenant/rentals` → `201 Rental`
- `GET /api/tenant/rentals/{id}` → `200 Rental`
- `PATCH /api/tenant/rentals/{id}/assign` → `200 Rental` (sets bike.current_rider_id, status → ACTIVE)
- `PATCH /api/tenant/rentals/{id}/return` → `200 Rental` (sets ended_at, bike.status → AVAILABLE)
- `PATCH /api/tenant/rentals/{id}/cancel` → `200 Rental`

```ts
interface Rental {
  id: string;
  bikeId: string;
  riderId: string;
  startedAt: string;
  endedAt: string | null;
  weeklyRate: number;
  depositAmount: number;    // default 5000
  status: 'BOOKED' | 'ACTIVE' | 'RETURNED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
}
interface RentalCreateRequest {
  bikeId: string;
  riderId: string;
  weeklyRate: number;
  depositAmount?: number;   // default 5000
  notes?: string;
}
```

#### Payments
- `GET /api/tenant/payments?page=0&size=20&status=PENDING&rentalId={uuid}` → `200 PageResponse<Payment>`
- `POST /api/tenant/payments` → `201 Payment`
- `GET /api/tenant/payments/overdue` → `200 Payment[]`
- `POST /api/tenant/payments/{id}/waive` → `200 Payment` (ADMIN only)

```ts
interface Payment {
  id: string;
  rentalId: string;
  amount: number;
  type: 'DEPOSIT' | 'RENT' | 'LATE_FEE' | 'REFUND';
  dueDate: string;          // ISO date
  paidDate: string | null;
  paymentMethod: 'CASH' | 'UPI' | 'BANK' | 'OTHER' | null;
  reference: string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'WAIVED';
  weekOf: string;           // Monday of the week
  createdAt: string;
}
interface PaymentCreateRequest {
  rentalId: string;
  amount: number;
  type: 'DEPOSIT' | 'RENT' | 'LATE_FEE' | 'REFUND';
  dueDate: string;
  paidDate?: string;
  paymentMethod?: 'CASH' | 'UPI' | 'BANK' | 'OTHER';
  reference?: string;
}
```

#### Shared blacklist
- `GET /api/tenant/blacklist/shared?page=0&size=20` → `200 PageResponse<BlacklistEntry>` (read-only, across all tenants)

```ts
interface BlacklistEntry {
  id: string;
  riderPhone: string;
  riderName: string;
  reason: string;
  blockedByTenantId: string;
  blockedByTenantName: string;
  blockedAt: string;
  isActive: boolean;
}
```

#### Tenant analytics
- `GET /api/tenant/analytics` → `200 TenantAnalytics`
```ts
interface TenantAnalytics {
  totalBikes: number;
  availableBikes: number;
  rentedBikes: number;
  totalRiders: number;
  activeRentals: number;
  overduePaymentsCount: number;
  overdueAmount: number;
  revenueThisWeek: number;
  revenueByWeek: Array<{ weekOf: string; revenue: number }>;  // last 8 weeks
  fleetUtilization: number;  // % of bikes currently rented
}
```

---

## 7. Shared component specs (Abhiram's deliverables)

All files in `frontend/src/components/ui/`. Use shadcn CLI to scaffold primitives: `npx shadcn@latest init` then `npx shadcn@latest add button input label form dialog dropdown-menu table card badge separator skeleton sonner`.

### 7.1 DataTable.tsx

A reusable, type-safe data table with sort, pagination, search, and empty state.

**Props:**
```ts
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];               // TanStack Table v8 ColumnDef or compatible shape
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchKey?: keyof T;
  emptyState?: React.ReactNode;          // rendered when data.length === 0
  pageSize?: number;                     // default 20
  onRowClick?: (row: T) => void;
}
```

**Behavior:**
- Header row with column titles (sortable if column has `enableSorting: true`)
- Search input above table (filters client-side by `searchKey`)
- Pagination footer (page size selector 10/20/50, prev/next, page indicator)
- Loading: show `<Skeleton>` rows in place of data
- Empty: show `emptyState` slot or default "No data"
- Row click: calls `onRowClick(row)` if provided

**Skeleton (use):**
```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

**Example usage:**
```tsx
<DataTable
  data={bikes}
  columns={[
    { header: 'Model', accessorKey: 'model' },
    { header: 'Reg #', accessorKey: 'registrationNumber' },
    { header: 'Status', accessorKey: 'status', cell: (b) => <StatusBadge status={b.status} /> },
  ]}
  searchPlaceholder="Search by registration..."
  searchKey="registrationNumber"
  isLoading={isLoading}
  emptyState={<EmptyState title="No bikes yet" description="Add your first bike to get started." />}
/>
```

### 7.2 FormField.tsx

Wraps an input with label, error message, and helper text.

**Props:**
```ts
interface FormFieldProps {
  label: string;
  error?: string;            // from react-hook-form errors
  helperText?: string;
  required?: boolean;
  children: React.ReactNode; // the input
  htmlFor?: string;
}
```

**Behavior:**
- Renders `<Label>` with `required` asterisk if `required === true`
- Renders children (input)
- If `error`: shows error message in red below input
- If `helperText && !error`: shows helper text in muted color

**Example usage:**
```tsx
<FormField label="Email" error={errors.email?.message} required>
  <Input type="email" {...register('email')} />
</FormField>
```

### 7.3 EmptyState.tsx

Centered empty state with icon, title, description, and optional action.

**Props:**
```ts
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;     // lucide-react icon typically
  action?: React.ReactNode;   // e.g., a Button
}
```

### 7.4 StatusBadge.tsx

Color-coded badge for status strings.

**Props:**
```ts
interface StatusBadgeProps {
  status: string;             // free-form, but maps to a color
  variant?: 'default' | 'outline' | 'subtle';
}
// Color mapping:
// - 'AVAILABLE', 'ACTIVE', 'PAID', 'NEW' → green
// - 'RENTED', 'PENDING', 'CONTACTED' → blue
// - 'OVERDUE', 'BLOCKED', 'SUSPENDED', 'REJECTED' → red
// - 'MAINTENANCE', 'RETIRED', 'INACTIVE', 'DISABLED', 'EXPIRED', 'CANCELLED' → gray
// - 'BOOKED', 'QUALIFIED', 'CONVERTED', 'WAIVED', 'TRIAL' → yellow
// unknown → gray
```

**Implementation:** Use shadcn `<Badge>` with className variant. Export a small `STATUS_COLORS` map.

### 7.5 ConfirmDialog.tsx

Confirmation dialog with destructive styling for danger actions.

**Props:**
```ts
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;       // default 'Confirm'
  cancelText?: string;        // default 'Cancel'
  variant?: 'default' | 'destructive';  // destructive = red confirm button
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}
```

### 7.6 PageLoader.tsx

Full-page loading spinner.

**Props:**
```ts
interface PageLoaderProps {
  label?: string;             // optional text below spinner
}
```

### 7.7 lib/api.ts

Axios instance with refresh-token rotation.

**Exports:** `api` (the axios instance)

**Behavior:**
- `baseURL` from `import.meta.env.VITE_API_BASE_URL`
- Request interceptor: attach `Authorization: Bearer <accessToken>` from `localStorage.getItem('accessToken')`
- Response interceptor: on 401 (not from `/auth/refresh` or `/auth/login`), call `POST /auth/refresh` with refreshToken from localStorage. If refresh succeeds, retry the original request once with new token. If refresh fails, clear tokens and redirect to `/login`.

**Note:** Must export a way to update tokens externally so `lib/auth.ts` can call it after login/refresh. Pattern:
```ts
let tokenGetter: () => string | null = () => localStorage.getItem('accessToken');
export const setTokenGetter = (fn: () => string | null) => { tokenGetter = fn; };
```
Then the request interceptor uses `tokenGetter()` instead of `localStorage` directly.

### 7.8 lib/auth.ts

Token storage and refresh helpers.

**Exports:**
```ts
export const getAccessToken: () => string | null;
export const getRefreshToken: () => string | null;
export const setTokens: (access: string, refresh: string) => void;
export const clearTokens: () => void;
export const refreshAccessToken: () => Promise<boolean>;  // returns true on success
```

**Storage:** localStorage keys `accessToken`, `refreshToken`, `user` (JSON-serialized AuthUser).

**Note:** On init, call `setTokenGetter(getAccessToken)` from `api.ts` to wire up the interceptor.

### 7.9 lib/queryClient.ts

TanStack Query client setup.

**Exports:** `queryClient`

**Defaults:**
- `staleTime: 30_000` (30s)
- `retry: 1`
- `refetchOnWindowFocus: false`

### 7.10 lib/utils.ts

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatCurrency = (n: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export const formatDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (d: string | Date): string =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatPhone = (p: string): string =>
  p.replace(/^(\d{5})(\d{5})$/, '$1 $2');  // Indian 10-digit: 98765 43210

export const formatStatus = (s: string): string =>
  s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
```

### 7.11 context/AuthContext.tsx

```ts
interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: AuthUser['role'][]) => boolean;
  hasPermission: (perm: string) => boolean;
}
```

**Behavior:**
- On mount: if `accessToken` exists in localStorage, call `GET /api/auth/me` to verify and hydrate user. Set `isLoading=false` after.
- `login`: calls `POST /api/auth/login`, stores tokens, sets user.
- `logout`: calls `POST /api/auth/logout`, clears tokens, redirects to `/login`.
- `hasRole`: returns true if `user.role` is in the list.
- `hasPermission`: returns true if `user.permissions` includes the string.

Wrap children in `<AuthContext.Provider value={...}>`. Export both the provider component and the `useAuth` hook (which lives in `hooks/useAuth.ts`).

### 7.12 hooks/useAuth.ts

```ts
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
```

### 7.13 hooks/useDebounce.ts

```ts
export function useDebounce<T>(value: T, delay = 300): T;
```
Standard debounce hook. Use in search inputs.

### 7.14 hooks/useToast.ts

```ts
interface ToastOptions {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
}
export function useToast(): {
  toast: (opts: ToastOptions | string) => void;
};
```
Wraps `sonner`'s `toast()` function. If string passed, treats it as the message.

### 7.15 hooks/usePagination.ts

```ts
interface PaginationState {
  page: number;       // 0-indexed
  size: number;       // default 20
  setPage: (p: number) => void;
  setSize: (s: number) => void;
  reset: () => void;
}
export function usePagination(initialSize = 20): PaginationState;
```

### 7.16 types/api.ts

**This file is the contract.** All request/response TypeScript types from §6, exported. Use `interface` for objects, `type` for unions. Names match exactly.

Example structure (full set in §9):

```ts
export type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_STAFF';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tenantId: string | null;
  permissions: string[];
}

export interface LoginRequest { email: string; password: string; }
export interface LoginResponse { accessToken: string; refreshToken: string; user: AuthUser; }
// ... and so on for every type in §6
```

---

## 8. Routes and pages

### Public routes (Abhiram owns)

| Path | Page | Notes |
|---|---|---|
| `/` | `Landing.tsx` | Hero, features, CTA to `/inquiry` and `/login`. Public, no auth. |
| `/inquiry` | `Inquiry.tsx` | Fleet-owner inquiry form. Posts to `POST /api/public/inquiries`. |
| `/login` | `Login.tsx` | Email + password form. Calls AuthContext.login. |
| `/forgot-password` | `ForgotPassword.tsx` | Email input, posts to `POST /api/auth/forgot-password`. Shows generic success. |
| `/reset-password` | `ResetPassword.tsx` | Reads `token` from query string, takes new password, posts to `POST /api/auth/reset-password`. |
| `*` | `NotFound.tsx` | 404 page. |

### App routes (SMK owns — but does NOT add to router until Day 2)

SMK will add these to `router.tsx` on Day 2 (or to a separate `AppRouter` component that wraps the public one):

| Path | Page | Role |
|---|---|---|
| `/app` | `pages/tenant/Dashboard.tsx` | TENANT_ADMIN, TENANT_STAFF |
| `/app/bikes` | `pages/tenant/BikesList.tsx` | both |
| `/app/bikes/new` | `pages/tenant/BikeCreate.tsx` | both |
| `/app/bikes/:id` | `pages/tenant/BikeDetail.tsx` | both |
| `/app/riders` | `pages/tenant/RidersList.tsx` | both |
| `/app/riders/new` | `pages/tenant/RiderCreate.tsx` | both |
| `/app/riders/:id` | `pages/tenant/RiderDetail.tsx` | both |
| `/app/rentals` | `pages/tenant/RentalsList.tsx` | both |
| `/app/rentals/new` | `pages/tenant/RentalBook.tsx` | both |
| `/app/rentals/:id` | `pages/tenant/RentalDetail.tsx` | both |
| `/app/payments` | `pages/tenant/PaymentsList.tsx` | both |
| `/app/blacklist` | `pages/tenant/BlacklistView.tsx` | both |
| `/app/staff` | `pages/tenant/StaffList.tsx` | ADMIN |
| `/app/analytics` | `pages/tenant/TenantAnalytics.tsx` | both |
| `/admin` | `pages/admin/AdminDashboard.tsx` | SUPER_ADMIN |
| `/admin/tenants` | `pages/admin/TenantsList.tsx` | SUPER_ADMIN |
| `/admin/tenants/new` | `pages/admin/TenantCreate.tsx` | SUPER_ADMIN |
| `/admin/tenants/:id` | `pages/admin/TenantDetail.tsx` | SUPER_ADMIN |
| `/admin/plans` | `pages/admin/PlansList.tsx` | SUPER_ADMIN |
| `/admin/inquiries` | `pages/admin/InquiriesList.tsx` | SUPER_ADMIN |
| `/admin/inquiries/:id` | `pages/admin/InquiryDetail.tsx` | SUPER_ADMIN |
| `/admin/analytics` | `pages/admin/PlatformAnalytics.tsx` | SUPER_ADMIN |
| `/admin/audit-logs` | `pages/admin/AuditLogs.tsx` | SUPER_ADMIN |

**Route protection (SMK implements on Day 2):**
- `/app/**` requires `TENANT_ADMIN` or `TENANT_STAFF`. Redirect to `/login` if not authenticated.
- `/admin/**` requires `SUPER_ADMIN`. Redirect to `/login` if not authenticated. Redirect to `/app` if wrong role.

---

## 9. TypeScript types — the contract

Put the following in `frontend/src/types/api.ts`. **These names and shapes are locked.** SMK will mirror them in his backend DTOs.

```ts
// Roles
export type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_STAFF';

// Common
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ApiErrorBody {
  code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Auth
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tenantId: string | null;
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
export interface RefreshRequest {
  refreshToken: string;
}
export interface ForgotPasswordRequest {
  email: string;
}
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// Inquiries
export type FleetSize = '1-10' | '10-50' | '50-200' | '200+';
export type InquiryStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'REJECTED' | 'CONVERTED';

export interface Inquiry {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  fleetSize: FleetSize;
  planInterest: string | null;
  message: string | null;
  status: InquiryStatus;
  createdAt: string;
}
export interface InquiryRequest {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  fleetSize: FleetSize;
  planInterest?: string;
  message?: string;
}
export interface InquiryUpdateRequest {
  status: InquiryStatus;
  notes?: string;
}

// Tenants
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: TenantStatus;
  contactEmail: string;
  contactPhone: string;
  city: string;
  createdAt: string;
  updatedAt: string;
}
export interface TenantCreateRequest {
  name: string;
  slug: string;
  planId: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  adminEmail: string;
  adminFullName: string;
  adminPassword: string;
}
export interface TenantUpdateRequest {
  name?: string;
  planId?: string;
  status?: TenantStatus;
  contactEmail?: string;
  contactPhone?: string;
  city?: string;
}

// Plans
export type PlanCode = 'STARTER' | 'GROWTH' | 'ENTERPRISE';

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  priceMonthly: number;
  maxBikes: number;
  maxRiders: number;
  maxStaff: number;
  features: string[];
  isActive: boolean;
}
export interface PlanCreateRequest {
  code: PlanCode;
  name: string;
  priceMonthly: number;
  maxBikes: number;
  maxRiders: number;
  maxStaff: number;
  features: string[];
}

// Users
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'TENANT_ADMIN' | 'TENANT_STAFF';
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

// Bikes
export type BikeStatus = 'AVAILABLE' | 'RENTED' | 'MAINTENANCE' | 'RETIRED';

export interface Bike {
  id: string;
  model: string;
  registrationNumber: string;
  chassisNumber: string;
  status: BikeStatus;
  batteryLevel: number;
  currentRiderId: string | null;
  acquiredAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface BikeCreateRequest {
  model: string;
  registrationNumber: string;
  chassisNumber: string;
  batteryLevel?: number;
  acquiredAt: string;
}

// Riders
export type RiderStatus = 'ACTIVE' | 'BLOCKED' | 'INACTIVE';

export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  aadhaarLast4: string | null;
  address: string | null;
  city: string | null;
  status: RiderStatus;
  blockedAt: string | null;
  blockReason: string | null;
  isOnSharedBlacklist: boolean;
  createdAt: string;
}
export interface RiderCreateRequest {
  fullName: string;
  phone: string;
  email?: string;
  aadhaarLast4?: string;
  address?: string;
  city?: string;
}
export interface BlockRiderRequest {
  reason: string;
  isShared: boolean;
}

// Rentals
export type RentalStatus = 'BOOKED' | 'ACTIVE' | 'RETURNED' | 'CANCELLED';

export interface Rental {
  id: string;
  bikeId: string;
  riderId: string;
  startedAt: string;
  endedAt: string | null;
  weeklyRate: number;
  depositAmount: number;
  status: RentalStatus;
  notes: string | null;
  createdAt: string;
}
export interface RentalCreateRequest {
  bikeId: string;
  riderId: string;
  weeklyRate: number;
  depositAmount?: number;
  notes?: string;
}

// Payments
export type PaymentType = 'DEPOSIT' | 'RENT' | 'LATE_FEE' | 'REFUND';
export type PaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'WAIVED';
export type PaymentMethod = 'CASH' | 'UPI' | 'BANK' | 'OTHER';

export interface Payment {
  id: string;
  rentalId: string;
  amount: number;
  type: PaymentType;
  dueDate: string;
  paidDate: string | null;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  status: PaymentStatus;
  weekOf: string;
  createdAt: string;
}
export interface PaymentCreateRequest {
  rentalId: string;
  amount: number;
  type: PaymentType;
  dueDate: string;
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
}

// Blacklist
export interface BlacklistEntry {
  id: string;
  riderPhone: string;
  riderName: string;
  reason: string;
  blockedByTenantId: string;
  blockedByTenantName: string;
  blockedAt: string;
  isActive: boolean;
}

// Analytics
export interface PlatformAnalytics {
  tenantCount: number;
  activeTenantCount: number;
  bikeCount: number;
  activeRentalCount: number;
  totalRevenue: number;
  overdueAmount: number;
  newInquiriesCount: number;
  topTenantsByRevenue: Array<{ tenantId: string; tenantName: string; revenue: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
}
export interface TenantAnalytics {
  totalBikes: number;
  availableBikes: number;
  rentedBikes: number;
  totalRiders: number;
  activeRentals: number;
  overduePaymentsCount: number;
  overdueAmount: number;
  revenueThisWeek: number;
  revenueByWeek: Array<{ weekOf: string; revenue: number }>;
  fleetUtilization: number;
}

// Audit
export interface AuditLog {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}
```

---

## 10. Day-by-day plan

### Day 1 — Foundation (8h)

**Abhiram (frontend foundation, solo work — his 25%):**
1. Init Vite + React + TS strict at `frontend/`.
2. Install Tailwind, shadcn, TanStack Query, axios, react-hook-form, zod, date-fns, lucide-react, sonner.
3. Scaffold shadcn primitives (`button`, `input`, `label`, `form`, `dialog`, `dropdown-menu`, `table`, `card`, `badge`, `separator`, `skeleton`, `sonner`).
4. Build custom shared components per §7 (`DataTable`, `FormField`, `EmptyState`, `StatusBadge`, `ConfirmDialog`, `PageLoader`).
5. Write `lib/api.ts`, `lib/auth.ts`, `lib/queryClient.ts`, `lib/utils.ts`.
6. Write `context/AuthContext.tsx` and `hooks/useAuth.ts`, `useDebounce`, `useToast`, `usePagination`.
7. Write `types/api.ts` (the full §9 contract).
8. Build public pages: `Landing`, `Inquiry`, `Login`, `ForgotPassword`, `ResetPassword`, `NotFound`.
9. Wire `main.tsx`, `App.tsx`, `router.tsx` with public routes only.
10. Verify: `npm run build`, `npm run typecheck` (strict), `npm run dev`, manually click through pages.
11. Commit + push to `phase-1-scaffold`.

**SMK (backend, solo work — Day 1 portion of his 75%):**
1. Maven scaffold at `backend/`. `pom.xml` with deps: web, security, jpa, validation, postgres, flyway, jjwt, mail, poi-ooxml, springdoc-openapi, testcontainers.
2. `docker-compose.yml` at repo root (postgres + mailhog).
3. Flyway migrations V1–V6 (all tables, RLS policies, seed).
4. `application.yml` + `application-local.yml`.
5. `config/`: `SecurityConfig`, `JwtConfig`, `OpenApiConfig`, `CorsConfig`.
6. `tenant/`: `TenantContext` (ThreadLocal), `TenantFilter`, `RlsInterceptor`.
7. `auth/`: `AuthController`, `JwtService`, `RefreshTokenService`, `UserDetailsService`. Endpoints: login, refresh, logout, me, forgot-password, reset-password.
8. `POST /api/public/inquiries` endpoint (so Abhiram can integrate against it).
9. Verify: `mvn clean compile`, `mvn test`, `docker-compose up -d`, `mvn spring-boot:run`, curl flows.
10. Commit + push.

**Day 1 demo:** Backend boots, login works, public inquiry submits, MailHog catches the email, frontend renders all 6 public pages.

### Day 2 — Core modules (SMK solo, 8h)

**Backend (4h):**
- All `/api/admin/**` controllers: tenants, plans, inquiries, analytics.
- All `/api/tenant/**` controllers: staff, bikes, riders, rentals, payments, blacklist.
- `shared/` `SharedBlacklistController`.
- `notification/EmailService` + `@Async` config + email events.
- Audit log interceptor.
- Tests: critical paths (tenant isolation, payment overdue calc).

**Frontend (4h):**
- `pages/admin/`: Tenants, Plans, Inquiries, AuditLogs, PlatformAnalytics stub.
- `pages/tenant/`: Dashboard, Bikes (list/create/edit), Riders (list/create/edit), Rentals (list/book/assign/return), Payments (list/record), Blacklist, Staff, TenantAnalytics stub.
- `components/layout/`: DashboardShell, AdminShell, TenantShell, Sidebar (role-aware), Topbar.
- `components/forms/`: RecordPaymentForm, BookRentalForm, BlockRiderForm, CreateTenantForm, etc.
- App routes (`/app/**`, `/admin/**`) added to router with role guards.
- TanStack Query hooks per resource.

**Day 2 demo:** Full tenant admin flow: create tenant → add bikes → add riders → book rental → record payment → block a rider → see analytics update.

### Day 3 — Polish, dashboards, Excel, integration (SMK solo, 8h)

**Backend (3h):**
- `excel/BikeImporter` + `excel/RiderImporter`.
- `POST /api/tenant/bikes/import` (multipart xlsx).
- Analytics aggregation queries (revenue by week, fleet utilization).
- Email notifications: welcome on tenant creation, payment receipt, overdue reminder (`@Scheduled` cron).
- OpenAPI export to `docs/openapi.yaml`.
- Backend `Dockerfile`.
- Integration tests with Testcontainers.

**Frontend (3h):**
- Super-admin dashboard with platform KPIs (revenue chart, tenant growth, top tenants).
- Tenant-admin dashboard (active rentals, overdue, fleet utilization, weekly revenue).
- Excel upload UI (drag-drop, preview, confirm).
- Empty states, loading skeletons, error boundaries.
- Responsive pass on dashboards.

**Integration + cleanup (2h):**
- End-to-end smoke: docker-compose up → migrations → seed → log in each role → full demo flow.
- README quickstart.
- Fix any drift.
- Commit + tag `phase-1-complete`.

---

## 11. Acceptance criteria — Definition of Done

### For Abhiram (end of Day 1)

**Code quality:**
- [ ] `npm run typecheck` exits 0 with strict mode ON
- [ ] `npm run build` exits 0
- [ ] No `any` types in `types/api.ts` or in any shared component props
- [ ] All shared components have explicit `interface Props` (or `interface DataTableProps<T>`)

**Structure:**
- [ ] `frontend/src/components/ui/` has all 6 custom components + shadcn primitives
- [ ] `frontend/src/lib/` has `api.ts`, `auth.ts`, `queryClient.ts`, `utils.ts`
- [ ] `frontend/src/context/AuthContext.tsx` exists
- [ ] `frontend/src/hooks/` has `useAuth.ts`, `useDebounce.ts`, `useToast.ts`, `usePagination.ts`
- [ ] `frontend/src/types/api.ts` has every type from §9 with exact names and shapes
- [ ] `frontend/src/pages/public/` has all 6 pages (Landing, Inquiry, Login, ForgotPassword, ResetPassword, NotFound)
- [ ] `frontend/src/router.tsx` only has public routes
- [ ] `.env.example` has `VITE_API_BASE_URL=http://localhost:8080/api`

**Behavior:**
- [ ] `npm run dev` starts, Landing page renders
- [ ] /login renders, can type, submit triggers AuthContext.login (will fail without backend — that's OK, just no JS errors)
- [ ] /inquiry renders, form has all fields per §6 InquiryRequest, Zod validation works
- [ ] DataTable demo: shows with mock data, search/sort/paginate work
- [ ] FormField renders label + input + error message correctly
- [ ] StatusBadge renders with correct color for each status
- [ ] API client interceptor attaches Authorization header (test in DevTools)

**Git:**
- [ ] All commits on `phase-1-scaffold` branch
- [ ] Commit messages follow `<scope>: <summary>` format
- [ ] Pushed to remote

**Reporting back:**
- [ ] List of files created (per folder)
- [ ] Output of `npm run build` (last 20 lines)
- [ ] Output of `npm run typecheck`
- [ ] Screenshot or description of Landing + Login + DataTable demo
- [ ] Any deviations from this spec (with reason)
- [ ] Any blockers

### For SMK (end of Day 1, backend only)

- [ ] `mvn clean compile` exits 0
- [ ] `mvn test` exits 0
- [ ] `docker-compose up -d` starts postgres + mailhog cleanly
- [ ] `mvn spring-boot:run` starts app, `/actuator/health` returns 200
- [ ] `POST /api/auth/login` with `admin@ev.com / Admin@123` returns access+refresh tokens
- [ ] `GET /api/auth/me` with token returns super-admin user JSON
- [ ] `POST /api/auth/refresh` rotates tokens
- [ ] `POST /api/public/inquiries` accepts a request and creates a row
- [ ] Two tenants seeded, RLS verified (tenant A's `/api/tenant/bikes` doesn't see tenant B's rows)
- [ ] Swagger UI at `/swagger-ui.html` shows all endpoints documented

### For SMK (end of Day 2)

- [ ] All `/api/admin/**` and `/api/tenant/**` endpoints implemented and tested
- [ ] Frontend admin pages for tenants, plans, inquiries, bikes, riders, rentals, payments, blacklist, staff
- [ ] End-to-end flow works: login → create bike → create rider → book rental → record payment → block rider
- [ ] Role-based route guards working (super-admin can't access `/app/**`, tenant-admin can't access `/admin/**`)

### For SMK (end of Day 3)

- [ ] Excel import works for bikes
- [ ] Both dashboards render with charts (Recharts)
- [ ] Email notifications fire on key events (check MailHog)
- [ ] README documents quickstart + seed creds + demo flow
- [ ] All committed and tagged

---

## 12. Kickoff prompts (paste into your tool)

### Worker A — SMK backend (Claude Code)

```
You are building Phase 1 of the EV Rental Platform backend. Owner: SMK.

READ FIRST (mandatory):
- /Users/sumukhmk/Documents/GitHub/EV-APP/docs/PHASE_1_PLAN.md

YOUR FILES (only edit these):
- backend/**
- db/migration/** (under backend/src/main/resources/)
- docker-compose.yml (at repo root)
- backend/pom.xml
- backend/Dockerfile (skip if no time on Day 1)
- docs/openapi.yaml (Day 3 export)

NOT YOUR FILES:
- frontend/** (Abhiram is doing this in parallel)
- docs/PHASE_1_PLAN.md (locked, do not edit)

TODAY'S SCOPE (Day 1):
1. Maven scaffold at backend/ (Spring Boot 3.3, Java 21, group com.evrental)
2. docker-compose.yml at repo root: postgres:16 (port 5432, user/pass ev/ev, db ev) + mailhog (1025/8025)
3. Flyway migrations V1 through V6 from §3 of the plan (all tables, RLS, seed)
4. Security + JWT config (jjwt 0.12), auth controller:
   - POST /api/auth/login
   - POST /api/auth/refresh
   - POST /api/auth/logout
   - GET /api/auth/me
   - POST /api/auth/forgot-password
   - POST /api/auth/reset-password
5. Multi-tenancy: TenantContext (ThreadLocal), OncePerRequestFilter extracts JWT → sets context, RlsInterceptor calls `SET LOCAL app.tenant_id`
6. POST /api/public/inquiries (for Abhiram's inquiry form)
7. Seed: 1 super-admin (admin@ev.com / Admin@123), 2 plans (Starter ₹0, Growth ₹4999), 2 tenants (greenfleet, cityride), 2 tenant-admins (admin@greenfleet.com / admin@cityride.com / Tenant@123)
8. application.yml + application-local.yml

HARD CONSTRAINTS:
- UUID primary keys (java.util.UUID, postgres uuid type)
- Every domain table has tenant_id column
- springdoc-openapi for /swagger-ui.html
- BCrypt for passwords
- No Redis, no RabbitMQ, no S3
- Refresh tokens stored in DB (refresh_tokens table), not stateless

VERIFY before reporting done:
- mvn clean compile exits 0
- mvn test exits 0
- docker-compose up -d starts postgres + mailhog cleanly
- mvn spring-boot:run starts app, /actuator/health returns 200
- POST /api/auth/login with admin@ev.com/Admin@123 returns {accessToken, refreshToken, user}
- GET /api/auth/me with token returns super-admin user
- POST /api/auth/refresh rotates tokens
- POST /api/public/inquiries accepts a request, creates row, fires email event (visible in MailHog)
- Two tenants seeded. Login as tenant A admin, GET /api/tenant/bikes (will be empty list) — verify RLS by checking DB directly that tenant B has no rows visible to A

RETURN:
- List of files created
- Output of mvn clean compile
- Output of mvn test
- Curl commands + outputs for login + me + refresh + inquiry
- MailHog screenshot URL showing the inquiry email
- Any deviations from PHASE_1_PLAN.md (with reason)
- Any blockers

If you hit a blocker that requires user input, stop and report it. Do NOT silently change the contract.
```

### Worker B — Abhiram frontend foundation (Cursor)

```
You are building the frontend foundation for Phase 1 of the EV Rental Platform. Owner: Abhiram. Tool: Cursor.

READ FIRST (mandatory, attach with @):
- @PHASE_1_PLAN.md

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
- frontend/components.json
- frontend/index.html
- frontend/src/main.tsx
- frontend/src/App.tsx
- frontend/src/router.tsx
- frontend/.env.example

NOT YOUR FILES:
- backend/**, db/**, docker-compose.yml
- frontend/src/pages/admin/** (SMK)
- frontend/src/pages/tenant/** (SMK)
- frontend/src/components/layout/** (SMK)
- frontend/src/components/forms/** (SMK)
- docs/PHASE_1_PLAN.md (locked)

USE CURSOR:
- Open the repo in Cursor. Open PHASE_1_PLAN.md in a tab.
- For chat: @PHASE_1_PLAN.md to attach, then paste this prompt.
- For multi-file edits: Cmd+I (Composer), reference PHASE_1_PLAN.md the same way.
- After each batch: run `npm run typecheck` and `npm run build` in the terminal.

TODAY'S SCOPE (Day 1):
1. Init Vite + React 18 + TypeScript 5 (strict) at frontend/
2. Install: tailwindcss postcss autoprefixer @tanstack/react-query axios react-hook-form zod date-fns lucide-react sonner clsx tailwind-merge class-variance-authority @radix-ui/* (per shadcn)
3. npx shadcn@latest init. Then npx shadcn@latest add button input label form dialog dropdown-menu table card badge separator skeleton sonner
4. Build custom shared components in components/ui/ per §7:
   - DataTable.tsx (typed, sortable, paginated, searchable)
   - FormField.tsx (label + input + error)
   - EmptyState.tsx
   - StatusBadge.tsx (color-coded per §7.4)
   - ConfirmDialog.tsx
   - PageLoader.tsx
5. Write lib/:
   - api.ts (axios with tokenGetter pattern, refresh interceptor — see §7.7)
   - auth.ts (token storage, refresh — see §7.8)
   - queryClient.ts (TanStack Query defaults — see §7.9)
   - utils.ts (cn, formatCurrency, formatDate, formatDateTime, formatPhone, formatStatus — see §7.10)
6. Write context/AuthContext.tsx per §7.11 (useAuth hook in hooks/useAuth.ts per §7.12)
7. Write hooks/: useDebounce.ts, useToast.ts, usePagination.ts per §7.13-7.15
8. Write types/api.ts — the FULL contract from §9. Every interface, every type, exact names and shapes.
9. Write pages/public/:
   - Landing.tsx — hero, features section, CTA buttons to /inquiry and /login
   - Inquiry.tsx — form per §6 InquiryRequest, Zod validation, posts to /api/public/inquiries, success toast
   - Login.tsx — email + password + forgot link, calls AuthContext.login
   - ForgotPassword.tsx — email input, posts to /api/auth/forgot-password
   - ResetPassword.tsx — reads ?token= from URL, new password field, posts to /api/auth/reset-password
   - NotFound.tsx — 404 with link home
10. Write router.tsx with ONLY public routes: /, /inquiry, /login, /forgot-password, /reset-password, * (NotFound)
11. main.tsx: wrap in QueryClientProvider, AuthProvider, RouterProvider, add <Toaster richColors />
12. .env.example: VITE_API_BASE_URL=http://localhost:8080/api

HARD CONSTRAINTS:
- TypeScript strict mode ON, no `any` in types/api.ts or shared component props
- shadcn/ui only (no MUI, no Chakra, no Ant Design)
- All API types in types/api.ts must match §9 EXACTLY — this is the contract SMK consumes
- Use `cn` from utils for conditional classes (never template-string concat for className)
- Path alias `@/` → `src/` (set in tsconfig.json + vite.config.ts)

VERIFY before reporting done:
- npm install succeeds
- npm run typecheck exits 0 (strict mode clean)
- npm run build exits 0
- npm run dev starts on :5173, Landing renders
- /login renders form
- /inquiry renders form, validation works (try submitting empty)
- DataTable demo: write a small story component that shows DataTable with 5 mock rows, renders correctly
- StatusBadge renders with correct color for sample statuses
- Open browser DevTools network tab on /login, see Authorization header on any request triggered

RETURN:
- List of files created (per folder)
- npm run build output (last 20 lines)
- npm run typecheck output
- Screenshot or description of: Landing page, Login page, /inquiry form, DataTable demo
- Any deviations from PHASE_1_PLAN.md (with reason)
- Any blockers

If you hit a blocker that requires user input, stop and report it. Do NOT silently change the contract.
```

---

**This document is the contract.** If you change a request/response shape, a table column, a route, or a component prop signature, update this file first, then change code, then commit both together. Silent drift breaks the 3-day plan.
