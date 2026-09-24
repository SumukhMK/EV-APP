# Deploying

The stack is in three pieces because it has to be.

| Piece | Host | Why there |
|---|---|---|
| Frontend | Netlify | Static bundle, already built and uploaded by CI |
| API | Render (or Fly.io / Railway) | **Netlify cannot host it** — it runs static assets and Node/Go serverless functions, not a JVM process holding a connection pool |
| Postgres | Neon | Netlify DB *is* Neon, and it hands out an ordinary `postgresql://` URL any external backend can use |

So "the Netlify database" and "the database the API talks to" are the same
instance. Only the compute is split.

---

## 1. Postgres (Neon)

Create the database — either through Netlify DB (which provisions Neon) or
Neon directly. Then take the **pooled** connection string, the host with
`-pooler` in it.

Convert it to JDBC form for `DB_URL`:

```
postgresql://user:pass@ep-x-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
→ DB_URL       jdbc:postgresql://ep-x-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
  DB_USER      user
  DB_PASSWORD  pass
```

Two things are not optional:

- **`sslmode=require`.** Neon refuses connections without it.
- **The pooled endpoint.** Neon caps direct connections well below what a JVM
  pool will open. Keep `DB_POOL_SIZE` small too — 5 is plenty.

**Tenant isolation survives transaction pooling.** `TenantFilter` sets the
tenant with `set_config('app.tenant_id', ?, true)`, and that `true` makes it
`SET LOCAL` — scoped to the transaction, released at commit. A pooler handing
the same connection to another request cannot carry the previous tenant with
it. If that flag ever becomes `false`, tenants leak silently and no test
catches it. It must stay `true`.

Flyway runs the migrations on first boot. Nothing to load by hand.

**Neon scales to zero.** The first request after an idle period waits for the
database to wake — usually a second or two. Not a bug, and not worth a
keepalive ping for a demo.

## 2. API (Render)

`render.yaml` in the repo root is the blueprint; `backend/Dockerfile` already
builds a layered, non-root, JRE-only image. Connect the repo as a Blueprint, or
create a Docker web service by hand with the same variables.

Set, beyond the database ones above:

| Variable | Value |
|---|---|
| `JWT_SECRET` | 32+ random bytes, generated per environment |
| `CORS_ALLOWED_ORIGINS` | the Netlify origin, exactly — `https://<site>.netlify.app`, no trailing slash, no wildcard |
| `APP_BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` | the first admin, created at boot if missing |

Then **unset the bootstrap password** once you have signed in. It is only
needed to create the account, and an environment variable is a poor place to
leave a credential.

Health check: `/actuator/health`. Health is the only actuator endpoint exposed
— every other one leaks something.

Deploy previews live on their own Netlify subdomains and are *not* covered by
`CORS_ALLOWED_ORIGINS`. Add them explicitly if a preview needs the real API.

## 3. Frontend (Netlify)

CI already builds and uploads `frontend/app/dist` (see `.github/workflows/ci.yml`
— Netlify receives finished files so the bundle that was tested is the bundle
that ships).

To point the deployed site at the API, set a repository **variable** (not a
secret) named `VITE_API_BASE`:

```
VITE_API_BASE = https://evrental-api.onrender.com/api/v1
```

It is not a secret. It is a public URL, and Vite bakes it into the bundle at
build time where anyone can read it.

Leave it unset and the deploy stays the fixtures-only demo it has always been —
which is the right state until the API is actually up.

## What is live, and what is not

Setting `VITE_API_BASE` does **not** wire the whole app. Only the modules with
a backend switch over:

| Module | Source |
|---|---|
| Auth | **API** (S0) |
| Vehicles | **API** (S1) |
| Riders, service jobs, assignments, payments, users, audit | fixtures, until S2–S6 land |

That coexistence is the steady state, not a workaround — see
`docs/backend/WORK_SPLIT.md` for what is left. Each module becomes live by
adding a `.live.ts` twin beside its `.mock.ts` and two lines in its facade;
`src/lib/api/vehicles.ts` is the worked example.

Two consequences worth knowing before a demo:

- **Login is real.** Accounts come from the database; there is no sign-up
  screen, by design. The first admin is the bootstrap account above.
- **The persona switch disappears.** The role comes off a signed token and
  cannot be changed client-side. A control that appears to change your role
  without changing it is worse than no control.

## Running the whole thing locally

```bash
cd backend && docker compose up -d          # Postgres on 5433
./mvnw spring-boot:run -Dspring-boot.run.profiles=local

cd frontend/app
cp .env.example .env.local                  # VITE_API_BASE → localhost:8080
npm run dev
```

The local profile creates the four demo accounts (password `demo-build`) and
loads the 137-bike demo fleet from `db/seed/fleet.csv`:

| Email | Role |
|---|---|
| `priya@g1mobility.in` | Super admin |
| `meenakshi@g1mobility.in` | Tenant admin |
| `abhinandan@g1mobility.in` | Service manager |
| `dhananjay@g1mobility.in` | Fleet staff |

That CSV is generated from the frontend fixtures — `npm run seed:export`
regenerates it. The point is that the wired screen and the mock screen show the
*same* fleet, so any difference between them is a defect rather than a
difference in the data. Regenerate it whenever the fixtures change.

Delete `.env.local` to go back to mocks.
