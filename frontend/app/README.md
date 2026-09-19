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

**Find the bike → open its job → write what you did → send it where it needs to go.**
There is no forced trip through the bike list or a separate inspection screen. "Bikes in
service", "QC queue" and "Help desk" are three views of the same jobs, not three lists.
"New job" is the one way in, whatever brought the bike to us, so there is no second
"check a bike" screen in the menu; `/service/inspection?vehicle=…` is only a deep link
from a bike's page into that same form.

The screens use everyday words. The table below maps them to the terms in the code.

| On screen | In the code | What it means |
|---|---|---|
| Came in as | Request source | How the bike reached us: a rider gave it back, a swap, roadside help (RSA), the rescue team (QRT), the rider came to the hub, or a routine check. Older records say "Older record". |
| How bad is the damage? | Damage severity | No damage, small, big or accident. It suggests where the bike should go. |
| What it needs / list | Service category | Needs checking, small repair, big repair, accident, warranty claim, insurance claim, waiting for parts, or QC. |
| Bike shows as | Vehicle state | Where the bike stands in the fleet. Small and big repairs are two separate lists, but in both the bike shows as "Under repair". |
| QC | QC | The last check on a bike before it goes back on the road. The word staff already use, so the screens use it too. |
| Ready to deploy | RTD | The bike passed QC and can go to a rider. |
| Who pays? | Liability | Take it from the deposit, the rider pays, or the company pays. |

| What staff need to do | How it works |
|---|---|
| Find work | `/service/queues` filters the job list in place. Every row opens its job directly. The search and filters stay in the address bar, so "Back to jobs" brings you back to the same view. |
| Log a roadside, rescue or walk-in job | "New job" records the bike, how it came in, how bad the damage is, what is wrong, where it is, and which list it goes to. Confirming moves the bike straight away and opens the job. If the bike already has an open job, you are sent to that one instead of opening a second. |
| Check a bike you already have | "Check this bike" on a bike's page opens the same "New job" form with the bike filled in, or jumps straight to its open job if it has one. |
| Say where the bike is | At intake the hub is a dropdown, filled in from the bike's own record. Only roadside and rescue jobs ask for a free-text spot, because that is the one case where it is not a hub. |
| Record a repair | Save what you found, who did the work, and each part / labour cost. Saving does not finish the job and does not charge the rider. Everything you save stays visible in the history. |
| Wait for parts or a claim | Move the bike to "Waiting for parts", "Warranty claim" or "Insurance claim" and say which parts you expect, or the claim number. |
| Decide what happens next | The job page asks one question — "What do you want to do?" — and lists the real choices: keep working, send it for QC, move it to another list, or send the bike back out. Picking one names the button at the bottom, so the button always does exactly what was picked. Changing the choice clears the confirm tick. |
| Send it for QC | You must say what you found and who did the work. The same job then shows up in `/service/qc`. |
| QC failed | Write why it failed and send it back to small or big repair. The job keeps its costs and history and can come back for QC again. |
| Send the bike back out and charge | A service manager or admin reviews the work, the cost and who pays, then confirms on the same screen. A rider charge is added once; a deposit charge comes off the deposit we hold; a company charge adds nothing to the rider. If the deposit is too small, we refuse it. A ₹0 job is fine. Anything over ₹5,000 is flagged. |
| Taking a bike back or swapping it | Both screens offer the same four places a bike can go: ready to deploy, under repair, QC, or accident. The condition suggests one; if you pick another, say why. Damage needs part-level notes. The bike movement and the service job are saved together, reusing an open job if there is one. |

A bike going in for service **does not take it away from the rider**: the rider keeps it on
paper, and when the work is done the bike goes back to that same rider. Taking a bike back
or swapping it does detach it, and after service it can become ready to give out. A bike
with unfinished service costs cannot jump straight to "ready to deploy". Sending a bike
out without QC is allowed, but you are warned and must say what you checked.

**Deboarding settles rent, not damage.** The deboard screen takes the rent still owed and
works out what is left of the deposit. It does not ask anyone to guess a damage deduction,
because at that moment nobody has looked at the bike. What the repair costs is decided on
the service job, and only then does "Who pays?" decide whether it comes out of the deposit.

`/flows` is a hidden page, like `/design-tokens`. It draws the whole journey — a bike's
life, deboarding, the four ways a bike reaches service, what happens inside service, and
where the money ends up — for anyone who needs the picture rather than the screens.

Fleet staff can log jobs, write findings and move bikes between lists. A service manager or
admin decides who pays and sends the bike back out. These are **prototype screen rules, not
real server-side permissions**. Finished jobs are read-only. Forms confirm inline instead of
opening pop-ups.

The list counts and the live fleet numbers come from the same records. Older repair bikes
with no recorded damage start in **Needs checking** rather than being guessed into small or
big repair. Today's Operations counts service requests logged in the period you pick; its
movement totals and the billing run's periods are still sample data.

The jobs table shows what staff act on: the bike, what it needs, how bad the damage is,
the status, **how long it has been waiting**, the cost so far, and the next thing to do.
How a bike arrived is context rather than a work signal, so it is a filter and a line on
the job itself, not a column competing for width.

The fixtures deliberately cover the whole workbench: every list has bikes in it, every way
a bike can arrive appears, all four damage levels and all three statuses are present, and
finished jobs exist for each way a repair can be paid for. Some of those finished jobs bill
the current week and one bills the week before, so the weekly run shows both **Repairs** and
**Old dues** rather than a column of zeroes.

Mock data survives normal navigation but **resets on a full page reload**. This work does
not add a backend, real sign-in, photo uploads or a parts inventory.

## Unbuilt screens

Every route in the wireframe exists. Unbuilt ones render `Placeholder`, which names the artboard
and its owner. Replace the placeholder in `src/app/router.tsx` with the real screen when you build
it; leave the route path alone so links keep working.
