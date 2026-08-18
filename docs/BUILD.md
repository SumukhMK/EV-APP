# BUILD.md — EV Rental Platform, Phase 1

Work split for Phase 1 between **SMK** and **Abhiram**. Two people, part time.
Read `PROJECT_CONTEXT.md` and the tech-stack brief before starting.

Goal of Phase 1: replace Ashok's Excel file with an admin web app. No mobile,
no online payments, no chassis photo reading. Admin staff enter everything.

---

## 0. Stack conflict to resolve first (blocker)

The two source documents disagree on the stack. Pick one before writing code.

| Layer | PROJECT_CONTEXT.md | tech-stack brief (newer, detailed) |
|---|---|---|
| Frontend | Next.js + TS + Tailwind | React + TS + Vite |
| Backend | NestJS (TS end to end) | Java + Spring Boot |
| ORM | (Prisma implied) | Spring Data JPA + Hibernate |
| Migrations | - | Flyway |
| Cache | - | Redis |
| Queue | generic queue | RabbitMQ |

This BUILD.md is written for the **tech-stack brief** (Spring Boot + React/Vite +
Postgres + Flyway + Redis + RabbitMQ + Docker), because it is the more considered
engineering document. If you and Abhiram choose the NestJS path instead, keep the
same module split below and swap the tool names.

Decide with Abhiram, then delete this section.

---

## 1. Ground rules

- One person, one module set. Never two people editing the same files.
- Backend is a **modular monolith**: one deployable app, split into modules that
  only talk through defined interfaces (auth, provider, vehicle, rider,
  assignment, rent, payment, complaint/blacklist, notification, audit).
- Every provider's data is filtered server side, based on the logged in user.
  Never trust the frontend for authorization. This is checked on every request.
- Foreign keys enforced in the database. Financial and audit rows are
  append only, never edited or deleted. Corrections create a new linked row.
- Every list endpoint is paginated from day one.
- SMS runs async through the queue, never in the web request.
- No Aadhaar stored in full. Masked only.
- Audit log on everything touching money, KYC, and blacklisting.

---

## 2. The split

Clean boundary: **SMK owns backend + data + infra. Abhiram owns the admin web app
+ shared contracts on the frontend side.** They meet at the API contract.

### SMK — backend, database, infrastructure

Owns these directories (nothing here is touched by Abhiram):
- `backend/**`
- `infra/**` (Docker, compose, CI)
- `db/migrations/**` (Flyway)

Responsibilities:
1. Project skeleton: Spring Boot app, Docker, docker-compose (Postgres, Redis,
   RabbitMQ), GitHub Actions CI running tests on every PR.
2. Database schema + Flyway migrations for all Phase 1 tables:
   provider, app_user + roles, vehicle, rider, assignment, rent_schedule,
   payment, blacklist_entry, complaint, notification_log, audit_log, template.
   Tenant id on every table. Unique constraint on chassis number.
3. Auth + RBAC: login, roles (super admin, provider admin, staff), server side
   tenant filtering enforced automatically on every request.
4. Module APIs (REST), each paginated, each audited where money/KYC/blacklist:
   - Provider + user management (super admin only)
   - Vehicle registry (manual chassis entry, spec fields from Ashok's Excel)
   - Rider records + document upload to S3, signed URLs
   - Assign bike to rider, generate monthly rent schedule
   - Manual payment recording, overdue calculation, receipt generation
   - Blacklist: flagged list with reason + evidence attachment, shared across
     providers (the one intentional exception to tenant isolation, own service)
   - Dashboard aggregate endpoints (per provider + super admin roll up)
5. Notification service: one service, events in, channels out, templates in DB,
   every send logged. Monday reminder job. SMS provider integration behind the
   queue. (Provider choice still open — see PROJECT_CONTEXT.)
6. Excel migration script for the existing 150 bikes and riders.

### Abhiram — admin web app

Owns these directories (nothing here is touched by SMK):
- `frontend/**`

Responsibilities:
1. React + TS + Vite skeleton, routing, auth wiring (login, session, role guards
   on the client for UX only — real enforcement is server side).
2. Shared layer: TanStack Query setup, API client, React Hook Form + Zod schemas
   that mirror the backend validation rules.
3. Screens (desktop web, English only, Phase 1):
   - Login + role based navigation
   - Provider + user management (super admin view)
   - Vehicle registry: list, add/edit with manual chassis entry, per bike view
     (invested value vs business generated — definition still open with Ashok)
   - Rider records: list, add/edit, document upload
   - Assignment flow: assign bike to rider, show rent schedule
   - Payments: record payment, overdue list with warnings, receipt view/print
   - Blacklist: flagged list with reason and evidence attachment
   - Dashboards + charts: one per provider, plus super admin roll up
4. Empty/loading/error states, pagination controls on every list.

### Shared, decide together up front

- **API contract**: agree endpoint shapes and DTOs before building screens.
  Write it down (OpenAPI or a simple markdown table) so both sides build against
  the same thing. This is the seam. Get it right early.
- The exact vehicle + rider field list. Blocked on Ashok's Excel — chase it.
- UI component library choice (from the tech-stack "decisions to confirm").

---

## 3. Suggested order (roughly one month)

**Week 1**
- SMK: repo skeleton, Docker compose, CI, database schema + Flyway, auth + RBAC.
- Abhiram: frontend skeleton, auth wiring, API client, agree the API contract
  with SMK.
- Both: build the throwaway v0/Emergent demo to keep Ashok engaged. Never ship it.

**Week 2**
- SMK: provider/user, vehicle, rider modules + document upload.
- Abhiram: provider/user, vehicle, rider screens against those APIs.

**Week 3**
- SMK: assignment, rent schedule, payment, overdue, receipts.
- Abhiram: assignment, payment, overdue, receipt screens.

**Week 4**
- SMK: blacklist service, notification service + Monday SMS, Excel migration.
- Abhiram: blacklist screen, dashboards + charts, polish.
- Both: end to end test on real migrated data. Fix, harden, hand over.

---

## 4. Definition of done for Phase 1

- Admin can do everything Ashok does in Excel today, in the web app.
- Provider A cannot see Provider B's data, verified by trying.
- Payments and blacklist actions are audited and cannot be silently edited.
- Monday reminder SMS goes out via the queue.
- The 150 existing bikes and riders are migrated in.
- CI is green. Backups configured. One smoke run through the whole flow.

---

## 5. Do not start the real build until

Money rules and blacklist rules are answered in writing by Ashok
(see open questions 1 to 8 in `PROJECT_CONTEXT.md`). Demo is fine to build now.
