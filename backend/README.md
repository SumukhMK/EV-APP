# Backend — EV Rental Platform API

Spring Boot 4.1 · Java 21 · PostgreSQL 16 · Flyway.

This is stage **S0** from [`docs/BUILD.md`](../docs/BUILD.md), complete: the
skeleton boots, connects, migrates and is tested, and auth (login → JWT →
refresh rotation → logout → `/me` → TenantFilter) is in and covered by
`AuthFlowTest`.

---

## Run it

Two ways. The first is the working loop.

```bash
docker compose up -d                                  # Postgres 16
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

`docker compose up` starts **only the dependencies** — it does not run the app.
That is deliberate: devtools restarts the API on a recompile and a debugger
attaches with no port plumbing, neither of which survives being wrapped in an
image rebuild.

```bash
docker compose --profile full up -d --build           # ...plus the API itself
```

For a demo box, or to check the app runs from environment variables alone. The
container does **not** activate the `local` profile: it reads `DB_URL`,
`JWT_SECRET` and the rest from its environment exactly as a deployed instance
will, and reaches the database at `postgres:5432` — the service name, not
`localhost`, which inside a container means the container. It waits for
Postgres's healthcheck before starting, because Flyway runs at boot and needs a
database that is accepting connections, not merely created.

Either way `curl localhost:8080/actuator/health` → `{"status":"UP"}`. Run from
the host you also get the component breakdown; from the container you get the
bare status, because `show-details` is off outside the `local` profile. Both
are correct — that difference is the production config path working.

Nothing else is exposed yet — every other path returns 401 by design (see
below), and an unmatched one returns 404.

There is no mail server and no mail dependency. Nothing sends mail before the
notification module (S6), and the sink is worth choosing then rather than now.

```bash
./mvnw test        # needs Docker running: the tests use a real Postgres
./mvnw verify      # what CI runs
```

No Maven install required. `./mvnw` is the script-only wrapper: it downloads
Maven 3.9.9 on first run and caches it under `~/.m2/wrapper`.

---

## What is here

```
com.evrental/
  EvRentalApplication.java   — entry point, @EnableAsync, @EnableScheduling
  common/                    — PageResponse, ApiErrorResponse, the exceptions,
                               GlobalExceptionHandler, Money (paise)
  config/                    — SecurityConfig, AsyncConfig
  auth/ platform/ vehicle/ rider/ user/ service/
  assignment/ payment/ shared/ notification/ excel/
                             — one package per module in ARCHITECTURE.md, each
                               holding a package-info that states what it owns,
                               which stage builds it and who owns that stage
```

The empty packages are deliberate. The module boundary is the thing two people
working part time on separate file sets rely on; having it exist before there is
code in it is what stops a class landing in the wrong module.

`src/main/resources/db/migration/V001__baseline.sql` creates `tenants`, `users`
and `refresh_tokens`, and the row-level security described below.

---

## The two things worth knowing before you add code

### 1. Isolation is the database's job, not yours

Every tenant-scoped table gets `SELECT enable_tenant_rls('table_name')` in its
migration. That enables RLS, **forces** it (so the owning role is not exempt),
and installs a policy with both `USING` and `WITH CHECK`, so a wrong-tenant
write is refused as firmly as a wrong-tenant read.

Each request sets `app.tenant_id` on its transaction with `SET LOCAL`. Super
admin sets the sentinel `'*'` — that is the only bypass, and it is greppable.

Two consequences:

- **The application connects as the `evrental` role, never as a superuser.** A
  Postgres superuser ignores every policy silently. The init script
  (`db/init/01-app-role.sql`) creates that role, and both docker-compose and the
  test suite run the same file.
- **`TenantIsolationTest` queries `users` with no `WHERE tenant_id` at all.** It
  is written as the worst repository method anyone could write, and it still
  must not see the other tenant. If it ever goes green for the wrong reason —
  someone drops `FORCE`, someone connects as `postgres` — that test is what
  notices.

### 2. Security is closed by default

`SecurityConfig` permits the health probe, CORS preflight and the three open
auth endpoints (`login`, `refresh`, `logout`), and denies everything else.
There is no permit-all fallback and no default user, so a new endpoint added
before its access rule returns 401 rather than serving a stranger. That is the
intended failure direction.

### 3. Auth

Four endpoints under `/api/v1/auth`:

| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST /login` `{email, password}` | open | `200 {accessToken, refreshToken, user}`; wrong credentials → `401 "Invalid email or password"` (one message for both, so a stranger cannot probe for valid addresses); blank field → `422 {field, message}` |
| `POST /refresh` `{refreshToken}` | open | `200` same shape, token rotated; a revoked token replayed → `401` and the **whole chain** is revoked, including the live successor |
| `POST /logout` `{refreshToken}` | open | `204`, idempotent — revoking an unknown or already-revoked token is still a success |
| `GET /me` | bearer | `200` the caller's `User`; no token or a bad one → `401` |

Access tokens are HS256 JWTs with `sub`, `tenant_id`, `role`, `iat`, `exp`,
`iss` — 15 minutes. Refresh tokens are opaque 32-byte values, stored only as a
SHA-256 hash, valid 7 days, rotated on every use. `JwtAuthenticationFilter`
turns a valid bearer token into the request principal; `TenantFilter` then
opens the request transaction and issues `SET LOCAL app.tenant_id` from the
token's tenant, so RLS scopes every query in the request. Login/refresh/logout
run in their own `REQUIRES_NEW` transaction under the `'*'` sentinel, because
email and token-hash lookups are global, not tenant-scoped.

**Bootstrap.** On boot, `BootstrapData` creates the first admin from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` (skipped when unset, idempotent
when set). With `DEMO_PASSWORD` set it also seeds the G1 Mobility tenant and
its demo users. The `local` profile fills all four in:

| Email | Role | Tenant |
|---|---|---|
| `priya@g1mobility.in` | `SUPER_ADMIN` | Platform |
| `meenakshi@g1mobility.in` | `TENANT_ADMIN` | G1 Mobility |
| `abhinandan@g1mobility.in` | `SERVICE_MANAGER` | G1 Mobility |
| `dhananjay@g1mobility.in` | `FLEET_STAFF` | G1 Mobility |

All demo users share the `DEMO_PASSWORD` (`demo-build` locally — the same
value the frontend's `Login.tsx` pre-fills).

---

## Configuration

`application.yml` has no defaults for anything environment-specific, so a
missing variable fails at boot instead of falling back to a development value.

| Variable | Local value | Notes |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | in `application-local.yml` | `evrental` role, not `postgres`; local Postgres publishes on host **5433** (the Windows service `postgresql-x64-18` owns 5432) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | the Vite dev server |
| `JWT_SECRET` | dev key in `application-local.yml` | **never** committed for a deployed environment |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | in `application-local.yml` | first admin, created at boot; empty = skip |
| `DEMO_PASSWORD` | `demo-build` in `application-local.yml` | seeds the G1 Mobility demo tenant and users; empty = skip |

Run with `-Dspring-boot.run.profiles=local` and the whole table is filled in for
you. Deployed environments supply all of it through the environment.

---

## The contract this is built against

`frontend/app/src/types/` is the API contract (docs/BUILD.md), and it wins over
older sketches:

- `PageResponse` mirrors `Page<T>` field for field. Spring's own `Page` JSON has
  different field names and is explicitly unstable across versions, so it is
  never returned raw.
- `ApiErrorResponse` mirrors `ApiError` in `lib/api/client.ts`: `message`,
  `status`, and an optional `field` so a failure can attach to one form input.
- Money is `long` paise everywhere inside the system. Rupees exist at the API
  boundary and nowhere else.
- User roles are the four in `types/user.ts` — `SUPER_ADMIN`, `TENANT_ADMIN`,
  `FLEET_STAFF`, `SERVICE_MANAGER`. `ARCHITECTURE.md` still names an older
  three-role set; the types file is newer and the screens are built on it.

---

## Next

S1 vehicles and S2 riders in parallel (WORK_SPLIT.md: SMK owns S1, Abhiram owns
S2). The role gate (`@PreAuthorize` on tenant-scoped endpoints) lands with the
first tenant-scoped module.
