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

## Conventions worth knowing

- **Money** is integer paise everywhere except the moment it is rendered (`rupees()`).
- **Enums** go over the wire as `SCREAMING_SNAKE`; the label map is in `labels.ts`.
- **Fixtures are derived, not duplicated.** Riders are built from the deployed bikes, the
  dashboard tiles are counted from the fixtures. Two numbers that must agree come from one source.
- **Vehicle state transitions** are listed in `VEHICLE_TRANSITIONS`. The UI offers only those.
- **There is no auth.** `src/app/session.tsx` is a stub. Any URL is reachable by typing it. Real
  authorisation is server-side and arrives with the API.

## Unbuilt screens

Every route in the wireframe exists. Unbuilt ones render `Placeholder`, which names the artboard
and its owner. Replace the placeholder in `src/app/router.tsx` with the real screen when you build
it; leave the route path alone so links keep working.
