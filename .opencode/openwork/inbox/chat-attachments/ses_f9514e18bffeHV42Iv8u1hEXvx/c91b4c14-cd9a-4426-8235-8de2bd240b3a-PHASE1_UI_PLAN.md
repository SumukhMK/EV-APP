# Phase 1 UI Build Plan

**Front end only. Mock JSON, no backend, no database.**
Last updated 3 September 2026.

---

## Why UI first

Ashok changes scope weekly and nothing is signed. Screens are cheap to change, schemas are not.
He also told us he judges the product on how it looks. So we build the front end, get it signed off
in writing, and only then ask for the data and build the backend against a frozen contract.

**The one rule that makes this pay off:** the mock JSON is not throwaway. Every fixture is written as
the API response we intend to ask for. When sign off comes, the fixtures are the contract.

---

## Stack

React 19, TypeScript, Vite. **Material UI v9** with a custom dark theme. TanStack Query for data,
React Hook Form + Zod for forms, React Router for navigation.

No backend. No auth library. No database. All data comes from `src/lib/api/*`, which returns typed
mock JSON from `src/mocks/*`. One swap point per resource later.

The app lives in **`frontend/app/`**. The signed-off wireframe stays in `frontend/wireframe/`.

```
cd frontend/app
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
npm run lint
```

### The look is not ours to invent

The wireframe ships its own design system — "Nocturne": a dark ground (`#161826`), a blurple accent
(`#9184d9`), Inter for text, monospaced tabular figures for every id and amount, and table row rules
that fade out at both ends. Those tokens are transcribed into `src/theme/tokens.ts` and expressed as
a MUI theme in `src/theme/theme.ts`.

**Screens do not hardcode colour, spacing or type.** They use the theme, the shared components, and
`src/lib/labels.ts` for the words attached to an enum. If something cannot be built from those,
that is a gap in the shared layer — raise it, don't work around it.

---

## Ownership, do not cross these lines

| Path | Owner | Rule |
|---|---|---|
| `src/theme/` | SMK | Design tokens and the MUI theme |
| `src/types/` | SMK | This is the API contract. Abhiram requests changes, never edits |
| `src/lib/api/`, `src/lib/labels.ts`, `src/lib/format.ts` | SMK | The mock API and shared vocabulary |
| `src/components/` | SMK | Shared primitives |
| `src/layouts/`, `src/app/` | SMK | Shell, nav, routing, session stub |
| `src/mocks/` | SMK now, Abhiram later | Seeded from the wireframe today; Abhiram replaces it with the cleaned tenant spreadsheet |
| `src/pages/vehicles/`, `src/pages/workshop/` | SMK | The vehicle flow |
| `src/pages/riders/`, `src/pages/assignments/` | Abhiram | The rider flow — his own files, free rein inside them |

One pull request per screen. SMK reviews every one. Abhiram does not merge his own.

---

## What is built

Nineteen artboards, nineteen routes. Every route exists; the unbuilt ones render a placeholder that
names the artboard and its owner, so a demo can walk the whole rail without a dead link.

### SMK — done

| # | Screen | Route |
|---|---|---|
| 01 | Login (no auth — any credentials) | `/login` |
| 02 | Operations dashboard | `/dashboard` |
| 03 | Vehicles list — facets, search, paging | `/vehicles` |
| 04 | Vehicle detail — spec, rider, lifecycle, assignment history | `/vehicles/:vehicleId` |
| 05 | Add vehicle — RHF + Zod, server-side field errors | `/vehicles/new` |
| 06 | Bulk upload — validate, preview, commit | `/vehicles/bulk-upload` |
| 13 | Inspection and state change | `/inspections` |
| 14 | QC queue — pass, or fail with a reason | `/qc` |

Plus the shell: nav rail, layout, router, theme, mock API, and the shared component set
(`DataTable`, `SimpleTable`, `StatTiles`, `FacetChips`, `PageHeader`, `Panel`, `StateChip`,
`DefinitionList`, `SearchField`, `TableFooter`, `BarChart`, `EmptyState`, `Mono`, `SelectField`).

### Abhiram — next

| # | Screen | Route |
|---|---|---|
| 07 | Riders list | `/riders` |
| 08 | Rider detail | `/riders/:riderId` |
| 09 | Onboard rider | `/riders/onboard` |
| 10 | Assign vehicle | `/assignments/assign` |
| 11 | Exchange vehicle | `/assignments/exchange` |
| 12 | Deboard rider | `/assignments/deboard` |

`src/lib/api/riders.ts` already returns 100 riders paired one-to-one with the deployed bikes, with
search, status facets and paging. He should not need to touch `src/mocks/`.

### Not yet assigned — say who owns these

| # | Screen | Route |
|---|---|---|
| 15 | Weekly payment run | `/payments/run` |
| 16 | Payment detail and receipt | — |
| 17 | Overdue riders | `/payments/overdue` |
| 18 | Users and roles | `/users` |
| 19 | Audit log | `/audit` |

The fixtures and API modules for 15, 17 and 19 already exist (`payments.ts`, `audit.ts`). Only the
screens are missing.

---

## Rules

- Nothing invented where a rule is unknown. Show the field, add a visible note, leave the logic out.
- Every phase 2 section is visible and tagged phase 2. Never present and dead.
- Mock JSON is shaped as the API response, never shaped for the convenience of one screen.
- Fixtures are derived, not duplicated. Riders are built from the deployed bikes; the dashboard
  tiles are counted from the fixtures. Two numbers that must agree are computed from one source.
- Every list paginated. Money is integer paise on the wire, formatted at the edge.
- No state management library until a screen actually needs it. TanStack Query is the cache.
- No backend, no ORM, no database, not even locally. Resist it.
- There is no authentication and it must not look like there is. `src/app/session.tsx` is a stub and
  says so; the login screen says so on the page.

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

## Known inconsistency in the wireframe

Artboard 07 shows riders R19 and R26 as *partial*; artboard 17 lists both as *overdue*, and its
sixteen-rider total does not match the eight rows it draws. The build derives the overdue list from
the rider fixtures so the dashboard tile, the list and the rider records always agree. Worth raising
with Ashok — it is the kind of thing he will spot on screen and read as a bug.

---

## Exit condition

A written sign off from Ashok on the screens and the fields on them. Then we ask for the missing
data listed in the readiness document, freeze the API contract from `src/types/`, and start the
backend. Not before.
