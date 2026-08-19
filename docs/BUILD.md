# BUILD.md — EV Rental Platform

Team: **SMK** (backend + infra) and **Abhiram** (frontend). Part time, own timelines.
Stack locked: **Spring Boot + React/Vite + PostgreSQL** (Flyway, Redis, RabbitMQ, Docker).

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

## Phases

**Phase 1 — replace the paper/Excel registry. Web only, admins only.**
Super Admin + Tenant Admin dashboards with the basics:
- Manage tenants + subscription plans
- Vehicle registry (manual chassis entry)
- Rider records + documents
- Assign bike to rider, weekly rent schedule (Mon→Mon, Thursday due, ₹5000 deposit, ₹100 late fee)
- Manual payment recording, overdue list, receipts
- Monday SMS reminder
- Simple blacklist (reason text, tenant admin decides)
- Fleet-owner inquiry / onboarding form inside the app
- Migrate existing 150 bikes and riders

**Phase 2 — make it operational.**
Rider mobile app, field-engineer app (tickets, repair cost), online payments,
maintenance/utilization/battery tracking, chassis photo reading, blacklist
disputes, WhatsApp + push, proper reports.

**Phase 3 — differentiate.**
GPS live location (bikes already have trackers + smart locks), auto eKYC,
incentives, predictive maintenance, tenant self-signup.

---

## Ownership (Phase 1)

The two sides meet at the **API contract** — agree endpoint/DTO shapes up front
so neither person blocks the other. One person, one file set. Never both on one file.

### SMK — backend + infrastructure  (`backend/**`, `infra/**`, `db/**`)

- Project skeleton, Docker (Postgres, Redis, RabbitMQ), GitHub Actions CI
- Database schema + Flyway migrations
- Auth + roles (Super Admin, Tenant Admin, Tenant Staff) with server-side tenant isolation
- APIs: tenants + subscription plans, vehicle registry, rider records + document upload,
  bike assignment + weekly rent schedule, payments + overdue + receipts,
  blacklist (shared across tenants), inquiry/onboarding form, dashboard aggregates
- Notification service + Monday SMS reminder (async via queue)
- Excel migration for the existing 150 bikes and riders

### Abhiram — admin web app  (`frontend/**`)

- React + Vite + TS skeleton, routing, auth/session wiring
- Shared layer: API client, TanStack Query, forms + validation
- Screens: login, tenant + subscription management (Super Admin),
  vehicle registry, rider records, assignment, payments/overdue/receipts,
  blacklist, inquiry/onboarding form
- Dashboards + charts: Tenant Admin view and Super Admin roll-up

---

## Ground rules

- Every tenant's data filtered server-side by the logged-in user. Never trust the frontend.
- Foreign keys enforced in the DB. Money and audit rows are append-only (corrections = new row).
- Every list paginated. SMS async through the queue. Audit log on money, KYC, blacklist.
- No Aadhaar stored in full (masked only).

## Still open (from Ashok)

Existing paper/DB records, onboarding form fields, service workflow. Chase these.
