# FleeTech OS — admin web app

React 19 + TypeScript + Vite + Material UI v9. Front end only: all data comes from typed mock
fixtures. There is no backend and no authentication yet.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
npm run lint
```

## How a screen is put together

```
src/pages/<area>/Screen.tsx      the screen — layout and interaction only
  ↓ useQuery
src/lib/api/<resource>.ts        the mock API, shaped as the REST response we will ask for
  ↓
src/mocks/<resource>.ts          the fixtures
```

A screen never imports from `src/mocks/`. That rule is what makes the backend swap a one-file
change per resource: `src/lib/api/client.ts` is the only place that knows the data is fake.

## Where things live

| Path | What |
|---|---|
| `src/theme/tokens.ts` | The Nocturne design tokens, transcribed from the wireframe |
| `src/theme/theme.ts` | Those tokens as a MUI theme. Dark only |
| `src/types/` | The API contract. Every fixture is a valid instance of one of these |
| `src/lib/api/` | Mock API, one module per resource |
| `src/lib/labels.ts` | Enum → the words the team uses, and the one colour each may take |
| `src/lib/format.ts` | Rupees and dates. Money is integer paise on the wire |
| `src/lib/schemas/` | Zod schemas for forms |
| `src/components/` | Shared UI. Build screens out of these |
| `src/app/nav.ts` | Nav and routing share one source, so neither can drift |
| `src/mocks/` | Fixtures, seeded from the wireframe's own dataset |

## Building a new screen

1. Start with `PageHeader` (section label, title, actions).
2. Group content in `Panel`.
3. For a paginated list: `FacetChips` + `SearchField` + `DataTable` + `TableFooter`.
   See `src/pages/vehicles/VehiclesList.tsx`.
4. For a short fixed list inside a panel: `SimpleTable`.
5. For a status: `StateChip` with a label and tone from `src/lib/labels.ts`. Never write the
   status text or pick its colour in the screen.
6. For any id, amount, chassis or timestamp: `Mono`, so columns of figures stay aligned.
7. For a form: React Hook Form + a Zod schema in `src/lib/schemas/`. MUI `select` fields need
   `SelectField` — `register` cannot wire them. See `src/pages/vehicles/AddVehicle.tsx`.

If a screen needs something the shared layer does not have, raise it rather than styling around it.

## List filters live in the URL

A list screen keeps its filter in the query string, not in component state:

```
/vehicles?state=UNDER_REPAIR&q=eagle
```

That is what lets the dashboard tiles link straight to a filtered list, and it makes a filtered view
bookmarkable, shareable, and reachable by the browser's back button. Three rules, all visible in
`src/pages/vehicles/VehiclesList.tsx`:

- **Read the filter from `useSearchParams`, never from `useState`.** An unknown value degrades to
  "all" rather than showing an empty table — links go stale, enums get renamed.
- **Write filter changes with `{ replace: true }`.** Otherwise every chip click and keystroke lands
  in history, and getting back to the dashboard takes twenty back presses.
- **A search box keeps its own state** so typing stays instant; only the debounced value is written
  to the URL and used for the query.

Dashboard tiles take a `to` and render as real anchors, so middle-click, the keyboard and the
browser's hover preview all work. Every tile leads to the set it counts.

## Conventions worth knowing

- **Money** is integer paise everywhere except the moment it is rendered (`rupees()`).
- **Enums** go over the wire as `SCREAMING_SNAKE`; the label map is in `labels.ts`.
- **Fixtures are derived, not duplicated.** Riders are built from the deployed bikes, the QC queue
  from the bikes in `QC_PENDING`, the dashboard tiles counted from the fixtures. Two numbers that
  must agree come from one source — and now that a tile links to the list behind it, any
  disagreement is one click from being seen.
- **Return/service workflows** use `RETURN_DESTINATIONS` and `QUEUE_STATE` in
  `lib/serviceWorkflow.ts`. A return closes an assignment before routing the bike; it is not
  limited to direct `DEPLOYED` transitions.
- **There is no auth.** `src/app/session.tsx` is a stub. Any URL is reachable by typing it. Real
  authorisation is server-side and arrives with the API.

## Responsive behaviour

Breakpoints are MUI's defaults (`sm` 600, `md` 900, `lg` 1200, `xl` 1536). Three rules:

1. **The shell.** The nav rail is permanent from `md` up and a drawer below it. Content centres and
   grows to `layout.contentMax` (1680) — the wireframe's 1180 column is the *reading* width for
   forms (`layout.readingMax`), not a cap on the app. On a 1920 display a 1180 column pinned left
   leaves a third of the screen empty and makes everything read small.
2. **Tables shed columns, they do not shrink.** A list keeps what someone actually scans for and
   drops the reference numbers. See `narrow` / `compact` in `VehiclesList`. Where even that will not
   fit — the QC queue, where the Pass and Fail buttons must never scroll out of reach — the table
   becomes a list of cards below `sm`.
3. **Anything wide scrolls inside its own box**, never the page. `SimpleTable` and `BarChart` both
   do this. `SimpleTable` derives its scroll threshold from its own column widths: `table-layout:
   fixed` honours the colgroup even when the declared widths exceed the table, so columns *overlap*
   rather than overflow if the threshold is too low.

Check a change at 390, 900, 1440 and 1920 before calling it done.

## Service management workflow

**Queue → work record → save / route / release.** There is no compulsory fleet-list,
vehicle-detail or separate Inspection detour. Service queues, QC and Assistance Desk
are views of the same work records, not independent lists.

| Concept | Meaning |
|---|---|
| Request source | How the job arrived: deboard, exchange, RSA, QRT, walk-in or inspection. Migrated records say Registry. |
| Damage severity | None, minor, major or accident; suggests the initial destination. |
| Service category | Assessment, minor repair, major repair, accident, warranty, insurance, parts waiting or QC. |
| Vehicle state | The physical fleet state. Minor and major are distinct work queues but both mean Under repair. |

| Staff story | Flow and recorded details |
|---|---|
| Find work | `/service/queues` filters the work list in place. Each row opens its work record directly. Search, source and category filters live in the URL; Back to jobs restores them. |
| Receive RSA / QRT / hub walk-in | New job records vehicle, source, severity, issue/affected parts, location and destination. Confirmation immediately moves the vehicle and opens the record. Existing active jobs are linked instead of duplicated. |
| Inspect an existing bike | `/service/inspection?vehicle=…` preselects the vehicle and goes directly to an existing job. Otherwise receive it for assessment, then record findings on its work record. |
| Record repair | Save findings, technician and itemised parts/labour/other costs without closing the job or billing the rider. Saved work snapshots and movement history remain visible. |
| Wait for parts / claim | Route to Parts waiting, Warranty or Insurance with the awaited parts/ETA or claim reference/follow-up. |
| Send to QC | Findings and technician are required. The same job appears in `/service/qc`. |
| Fail QC / rework | Record failure findings and return to minor/major repair. The same job retains costs and history and can be sent to QC again. |
| Release / charge | Service/admin reviews findings, exact costs and liability, then confirms inline. Rider liability posts once to the mock ledger; deposit liability deducts the held balance; company liability posts no rider charge. Insufficient deposit is rejected. Zero-cost releases are allowed. Costs above ₹5,000 are flagged. |
| Deboard / exchange | Both offer RTD, Under repair, QC and Accident. Severity suggests a default; an override needs a reason. Damage requires part-level detail. Assignment changes and service routing happen in one validated mutation, reusing an active job when present. |

A **service visit does not deboard the rider**: the assignment stays linked and release
returns that bike to its rider (`DEPLOYED`). A deboard or exchange explicitly detaches the
old bike; after service it can become RTD. Pending service costs must be resolved before
a return can skip straight to RTD. A service/admin release outside QC is explicitly warned
and requires recorded checks/reason.

Fleet staff may receive, inspect, save work and route jobs. Service/admin approves final
release and liability. These are **prototype UI gates, not server-side authorisation**.
Closed records remain read-only. Forms use inline confirmation instead of workflow modals.

Queue counts and live vehicle outcomes come from the same records. Existing repair bikes
without known severity start in **Needs assessment**, rather than fabricated minor/major
splits. Today's Operations sources count recorded intakes in the selected period; its
movement totals and the billing run's periods remain historical fixtures.

Mock data survives client-side navigation but **resets on a full page reload**. This work
does not add backend persistence, real authentication, photo uploads or a parts inventory.

## Unbuilt screens

Every route in the wireframe exists. Unbuilt ones render `Placeholder`, which names the artboard
and its owner. Replace the placeholder in `src/app/router.tsx` with the real screen when you build
it; leave the route path alone so links keep working.
