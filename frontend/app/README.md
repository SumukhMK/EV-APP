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
- **Vehicle state transitions** are listed in `VEHICLE_TRANSITIONS`. The UI offers only those.
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

## Unbuilt screens

Every route in the wireframe exists. Unbuilt ones render `Placeholder`, which names the artboard
and its owner. Replace the placeholder in `src/app/router.tsx` with the real screen when you build
it; leave the route path alone so links keep working.
