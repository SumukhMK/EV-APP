# Phase 1 UI Build Plan

**Front end only. Mock JSON, no backend, no database.**
SMK 65 percent, Abhiram 35 percent. Last updated 30 August 2026.

---

## Why UI first

Ashok changes scope weekly and nothing is signed. Screens are cheap to change, schemas are not.
He also told us he judges the product on how it looks. So we build the front end, get it signed off
in writing, and only then ask for the data and build the backend against a frozen contract.

**The one rule that makes this pay off:** the mock JSON is not throwaway. Every fixture is written as
the API response we intend to ask for. When sign off comes, the fixtures are the contract.

---

## Stack

Next.js App Router, TypeScript, Tailwind. No backend. No auth library. No database.
All data comes from `lib/api/*` which returns typed mock JSON. One swap point per resource later.

---

## Ownership, do not cross these lines

| Path | Owner | Rule |
|---|---|---|
| `types/` | SMK | Abhiram requests changes, never edits |
| `lib/api/` | SMK | This is the API contract |
| `components/ui/` | SMK | Shared primitives |
| `mocks/*.json` | Abhiram | Populated from the real tenant spreadsheet |
| `app/(app)/<his routes>` | Abhiram | Free rein inside his own routes |

One pull request per screen. SMK reviews every one. Abhiram does not merge his own.

---

## SMK, Claude Code

Cross file work and anything with a real rule in it.

1. Repo, Next.js scaffold, Tailwind, lint, CI, folder structure
2. Design tokens and base components: button, input, select, table, tag, tile, modal, drawer, toast
3. App shell, sidebar nav, role switch, tenant switch
4. `types/` for vehicle, rider, assignment, payment period, service ticket, recovery
5. `lib/api/` mock layer, one module per resource, shaped as the proposed API
6. Operations dashboard, Ashok's structure, phase 2 sections visibly tagged
7. Assign vehicle, only from ready to deploy, one to one enforced in the UI
8. Exchange vehicle, as two events, old assignment closed and new one opened
9. Deboard rider, condition capture and settlement summary, the gate
10. Weekly payment run, both Monday and Wednesday cycles
11. Vehicle state change and QC queue
12. Review of everything Abhiram ships

## Abhiram, Cursor

Self contained screens against components that already exist.

1. `mocks/*.json` built from the tenant spreadsheet, cleaned
2. Vehicle list, filters by state and hub
3. Vehicle detail, spec, device numbers, current rider, history
4. Add vehicle, single entry
5. Bulk vehicle upload, file picker, preview table, error rows
6. Rider list, active and inactive filter
7. Rider detail, profile, documents, current vehicle, assignment and payment history
8. Onboard rider, form and document upload
9. Overdue riders
10. Recovery list, record recovery with reason
11. Users and roles
12. Message templates and send log
13. Audit log

---

## Sequence

| Week | SMK | Abhiram |
|---|---|---|
| 1 | Scaffold, tokens, components, shell | Mock JSON from the spreadsheet |
| 2 | Types, mock API layer, dashboard | Vehicle list and detail |
| 3 | Assign, exchange | Add vehicle, bulk upload |
| 4 | Deboard and settlement | Rider list and detail, onboard |
| 5 | Payment run, state change, QC | Overdue, recovery |
| 6 | Polish, review, walkthrough build | Users, templates, audit |

Six weeks. **Showcase set is ready end of week 3:** shell, dashboard, vehicle list and detail,
rider list and detail, assign, exchange. That is enough to hold a presentation.

---

## Rules

- Nothing invented where a rule is unknown. Show the field, add a visible note, leave the logic out.
- Every phase 2 section is visible and tagged phase 2. Never present and dead.
- Mock JSON is shaped as the API response, never shaped for the convenience of one screen.
- No state management library until a screen actually needs it.
- No backend, no ORM, no database, not even locally. Resist it.

---

## Three things to confirm before week 1

Everything else is a dropdown value or a number, and eliciting those is what the UI is for.
Only these change whether a screen exists at all.

1. **Does the problem rider list survive?** It was central in June, absent on 27 August. Two screens.
2. **Is exchange a real flow we record properly?** Today the spreadsheet overwrites the old vehicle.
   One screen and a change to the assignment model.
3. **One tenant or several?** If more are coming, tenant management and the enquiry queue are in.
   Three screens.

---

## Exit condition

A written sign off from Ashok on the screens and the fields on them. Then we ask for the missing
data listed in the readiness document, freeze the API contract from the fixtures, and start the
backend. Not before.
