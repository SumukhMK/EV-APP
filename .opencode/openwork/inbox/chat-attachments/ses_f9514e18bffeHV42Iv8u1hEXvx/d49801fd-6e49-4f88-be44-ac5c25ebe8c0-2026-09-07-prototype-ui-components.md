# Prototype UI Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every UI pattern in the stakeholder prototype into `frontend/app` as reusable components, so the four missing views and the deepened rider flow can be built without either owner inventing markup.

**Architecture:** Twelve new shared primitives in `src/components/` (SMK, per the ownership table) plus page-local compositions in each owner's own page folders. Prototype modals become routed pages — the prototype's modal pattern is not copied. Every contract change is additive; where the prototype contradicts the existing contract, the field is rendered with a visible note and the logic is left out, per the Phase 1 rule.

**Tech Stack:** React 19, TypeScript, MUI v9, TanStack Query, React Hook Form + Zod, React Router 7, Vite.

**Spec:** [e-Connects-FleeTech-Master-Complete-Vehicle-Exchange.html](../../../e-Connects-FleeTech-Master-Complete-Vehicle-Exchange.html) — the stakeholder prototype. Read alongside [docs/PHASE1_UI_PLAN.md](../../PHASE1_UI_PLAN.md), which owns the ownership table and the design rules.

## Global Constraints

- **No test runner exists.** `package.json` scripts are `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `preview`. The gate for every task is: `npm run build` passes, `npm run lint` passes, and the named manual check in the task holds in `npm run dev`. Do not add a test framework as part of this plan — that is its own decision.
- **No hardcoded colour, spacing or type in a screen.** Consume `src/theme/theme.ts`, the `status` tones in `src/theme/tokens.ts`, and `src/lib/labels.ts`. A gap in the shared layer is raised, not worked around.
- **Ownership is not crossed.** `src/theme/`, `src/types/`, `src/lib/`, `src/components/`, `src/layouts/`, `src/app/`, `src/pages/vehicles/`, `src/pages/workshop/` are SMK. `src/pages/riders/`, `src/pages/assignments/` are Abhiram. Abhiram requests type changes, never edits `src/types/`.
- **One pull request per task.** SMK reviews every one. Abhiram does not merge his own.
- **Money is `Paise`** — minor-unit integers on the wire, never a float. Render with `rupeesWithSymbol` from `src/lib/format.ts`.
- **Ids and amounts are monospaced** — wrap in `<Mono>`.
- **Nothing invented where a rule is unknown.** Show the field, add a visible note, leave the logic out.
- **Routes, not modals.** Every prototype modal becomes a route already on the nav rail, or a new one added to `src/app/nav.ts` in the same commit as its route.

---

## Contract decisions

These were open conflicts between the prototype and `src/types/`. Decided here so no task has to guess. All are additive; none deletes a field a built screen relies on.

| Conflict | Decision | Why |
|---|---|---|
| Battery: ours `'SWAPPABLE' \| 'FIXED'`, prototype's Sun Mobility / Battery Smart / Yuma / Honda Swap | **Both.** Keep `batteryType`; add `batteryVendor: string \| null`. Two filters on the vehicle master. | They are two different facts. A Sun Mobility pack is swappable; the vendor says *whose* swap network. Collapsing them loses the one that matters for a breakdown. |
| Vehicle state: ours 8, prototype's 5 | **Add `RECOVERY` to `VEHICLE_STATES`.** Map prototype "Active"→`DEPLOYED`, "Scrapped"→`RETIRED` (relabel `RETIRED` to "Scrapped"). Keep `INDUCTED` and `RETURNED`. | The prototype's five are a dashboard summary, not an enum — but `RECOVERY` is a real state with its own workflow (Recovery Summary view) and has no home in ours. "Scrapped" is Ashok's word for `RETIRED`; a label change, not a state. |
| Billing: ours `BillingDay = 'MONDAY' \| 'WEDNESDAY'`, prototype's fixed Wed→Tue period **and** a per-rider Payment Day of all 7 days | **Keep `BillingDay` as the run cycle. Add rider-level `paymentDay` (7 values) as a captured, displayed field with a visible note, feeding no logic.** Flag to Ashok. | Genuinely contradictory: a Wed→Tue period cannot also be per-rider arbitrary. Capturing it loses nothing; deriving a period from it would invent a rule nobody has stated. |
| Deboard: ours `ReturnCondition` (4), prototype's 9 reasons **plus** a separate Next Vehicle Status | **Split into two fields.** Add `DeboardReason` (9 values) and `nextVehicleState: VehicleState` to `DeboardRiderRequest` and `ExchangeVehicleRequest`. Keep `returnCondition` as the damage category. UI defaults `nextVehicleState` from `returnCondition` and lets the operator override. | "Rider went to hometown" is why; "Under repair" is where the bike goes. One field cannot answer both, and the prototype proves the operator overrides the default. |
| Rider schema: ours 3 identity fields, prototype's ~30 | **Expand, additively.** Everything the prototype marks `*` is required; the rest optional. | Aadhaar + four verified numbers + two addresses is what the team actually collects. This is the largest real gap. |
| Plan tiers: ours free-entry paise, prototype's fixed ₹1,799–2,199 and deposit ₹5,000/₹10,000 | **Combobox** — the five tiers plus free entry. Stay `Paise` on the wire. | Tiers are today's price list, not a schema rule. Locking the enum means a repo change on the next price move. |
| Modals vs routes | **Routes win.** | Deep-linkable, survives refresh, matches the 19-artboard rail. The prototype used modals because it is one file. |

---

## File structure

### New shared primitives — `src/components/` (SMK)

| File | Responsibility |
|---|---|
| `VerifyField.tsx` | One identity field with its own OTP round-trip and verified state |
| `StepSection.tsx` | A numbered, always-visible section of a long form |
| `RecordSearchSelect.tsx` | Typeahead over records, resolving to an id |
| `SelectionSummary.tsx` | The strip that fills in once a record is picked |
| `MethodTabs.tsx` | Switch between entry methods; records which one was used |
| `FlowStrip.tsx` | Arrow-chained stage chips for a multi-stage process |
| `UploadBox.tsx` | Drop zone plus the expected-columns table |
| `QueueBox.tsx` | Heading over label/count rows that drill through |
| `PeriodToggle.tsx` | Day / Week / Month plus an anchor date |
| `DerivedField.tsx` | Read-only field whose value is computed from siblings |
| `InfoStrip.tsx` | A rule stated inside a form |
| `NumberedList.tsx` | Bold label + path hint rows |

### Page-local — SMK

| File | Responsibility |
|---|---|
| `src/pages/vehicles/_components/OcrFieldGrid.tsx` | Which vehicle fields the camera can read |
| `src/pages/vehicles/ScrapVehicle.tsx` | Screen 20: search → autofill → confirm disposition |
| `src/pages/operations/TodayOperations.tsx` | Screen 21: period view, movement / outcome / source |
| `src/pages/service/ServiceManagement.tsx` | Screen 22: ten queues in two boxes |
| `src/pages/recovery/RecoverySummary.tsx` | Screen 23: six recovery categories |
| `src/pages/inventory/InventoryManagement.tsx` | Screen 24: parts, stock actions, traceability |

### Page-local — Abhiram

| File | Responsibility |
|---|---|
| `src/pages/riders/_components/RiderIdentityStep.tsx` | Aadhaar + name + permanent address (step 1) |
| `src/pages/riders/_components/RiderContactStep.tsx` | Four verified numbers (step 2) |
| `src/pages/riders/_components/RiderAddressStep.tsx` | Local address, city/state/PIN/coords (step 3) |
| `src/pages/riders/_components/RiderCommercialStep.tsx` | Platform, plan, payment day, deposit (steps 4–5) |
| `src/pages/assignments/_components/DispositionFields.tsx` | Reason + date + next vehicle state, shared by exchange and deboard |

### Types and vocabulary — SMK

`src/types/vehicle.ts`, `src/types/rider.ts`, `src/types/assignment.ts`, `src/types/inventory.ts` (new), `src/lib/labels.ts`, `src/lib/api/inventory.ts` (new), `src/mocks/inventory.ts` (new), `src/app/nav.ts`, `src/app/router.tsx`.

---

## Why each component exists, and who consumes it

Count is prototype occurrences. A pattern used once stays page-local; used twice or across both owners' flows, it is shared.

| # | Component | Owner | Uses | Why it is a component | Consuming pages |
|---|---|---|---|---|---|
| 1 | `VerifyField` | SMK | 5 | Input + OTP input + Send + Verify + status, with the rule that a rider cannot deploy until all five are verified. Five copies of that in one form is five chances to get the gate wrong. | `/riders/onboard` (Abhiram) |
| 2 | `StepSection` | SMK | 6 | Numbered head + title + sub. Not a MUI `Stepper` — all steps stay visible and reachable; the prototype never blocks step 4 on step 2. | `/riders/onboard` (Abhiram), `/vehicles/bulk-upload` (SMK) |
| 3 | `RecordSearchSelect` | SMK | 3 | Typeahead over records that resolves to an id, with a hidden id field so the form submits `R014` and not "Ramesh". `Autocomplete` is already hand-rolled at `pages/workshop/Inspection.tsx:127` — this promotes it before it is written a fourth time. | `/assignments/exchange`, `/assignments/deboard` (Abhiram); `/vehicles/scrap`, `/inspections` (SMK) |
| 4 | `SelectionSummary` | SMK | 2 | The strip that answers "who did I just pick, and what are they holding" before the operator commits. Prototype fills it from the rider's current vehicle. | `/assignments/exchange`, `/assignments/deboard` (Abhiram); `/vehicles/scrap` (SMK) |
| 5 | `MethodTabs` | SMK | 1, but structural | Manual / Spreadsheet / Camera+AI. It also records the data source onto the saved record — the prototype states this three times ("Data source should be stored as: AI Scan"). That provenance rule belongs in one place. | `/vehicles/new` (SMK) |
| 6 | `FlowStrip` | SMK | 2 | The stage chain, `Upload → Map Columns → Validate → Duplicate Check → Preview → Confirm` and the OCR chain. Both are six stages with arrows; two hand-rolled versions will drift. | `/vehicles/bulk-upload`, `/vehicles/new` (SMK) |
| 7 | `UploadBox` | SMK | 1 | Dashed drop zone plus the expected-columns table. Split from the page because the same box will take the rider spreadsheet Abhiram is promised in the ownership table. | `/vehicles/bulk-upload` (SMK) |
| 8 | `QueueBox` | SMK | 4 | Heading over label/count rows, each drilling into a filtered list. Four boxes, 16 rows. Without it, four new views each grow their own list markup. | `/service`, `/recovery` (SMK) |
| 9 | `PeriodToggle` | SMK | 1, plus payment | Day / Week / Month plus an anchor date, emitting a resolved range. The payment run needs the same control for Wed→Tue periods, so the range maths lands once. | `/operations/today` (SMK), `/payments/run` (unassigned) |
| 10 | `DerivedField` | SMK | 1, plus payment | Read-only computed field — deposit pending = plan − paid. It exists so a computed value is visibly not an input; the payment run has five more of them. | `/riders/onboard` (Abhiram), `/payments/run` (unassigned) |
| 11 | `InfoStrip` | SMK | 4 | The prototype states rules inside forms ("Only vehicles in RFD can be assigned", "Recovery is intentionally not available in this workflow"). Under the Phase 1 rule these notes are load-bearing, so they get a component instead of a `<Typography>` each time. | `/riders/onboard`, `/assignments/*` (Abhiram); `/vehicles/new` (SMK) |
| 12 | `NumberedList` | SMK | 2 | Bold label + hint rows. Serves the part-usage traceability list and the same shape in Today's Operations. | `/inventory`, `/operations/today` (SMK) |
| 13 | `OcrFieldGrid` | SMK | 1 | Which of the five vehicle numbers a photo can populate. Page-local: it names vehicle fields and belongs to no other screen. | `/vehicles/new` (SMK) |

### Not a component

- **Stock pills (IN STOCK / LOW STOCK / OUT OF STOCK)** — that is the existing `StateChip` plus three entries in `src/lib/labels.ts`. Adding a `StockPill` would be a second way to draw a status, which the token comment forbids.
- **Tiles, tables, facets, search, panels, empty states** — the prototype's `.card`, `.table`, `.form-grid`, `.pill`, `.empty`, `.tablewrap` all map onto `StatTiles`, `DataTable`/`SimpleTable`, `FacetChips`, `SearchField`, `Panel`, `StateChip`, `EmptyState` as built.
- **Modal shell** — routes instead. `Dialog` stays for confirmations only, as in `pages/workshop/QcQueue.tsx:204`.

---

## Ownership split

**SMK — 13 components, 6 new pages, all type and vocabulary changes, 4 new nav entries.** Tasks 1–13 and 20–26.

**Abhiram — 5 page-local compositions, 3 rebuilt screens, all inside his own folders.** Tasks 14–19. He consumes Tasks 1, 2, 3, 4, 10, 11 and must not start Task 14 until Task 1 merges. Everything else of his is independent.

**Ordering:** SMK ships Tasks 1–4 and 10–11 first. That is the whole of Abhiram's dependency surface, and after it merges the two of you run in parallel — he on 14–19, you on 5–9 and 12–13, then 20–26.

---

### Task 1: `VerifyField`

**Files:**
- Create: `frontend/app/src/components/VerifyField.tsx`

**Interfaces:**
- Consumes: `status`, `StatusTone` from `src/theme/tokens.ts`; `StateChip` from `src/components/StateChip.tsx`.
- Produces:
  ```ts
  export type VerificationState = 'UNVERIFIED' | 'CODE_SENT' | 'VERIFYING' | 'VERIFIED' | 'FAILED';
  export interface VerifyFieldProps {
    label: string;
    value: string;
    onValueChange: (next: string) => void;
    code: string;
    onCodeChange: (next: string) => void;
    state: VerificationState;
    onSend: () => void;
    onVerify: () => void;
    placeholder?: string;
    codeLabel?: string;   // "OTP" default; WhatsApp says "code"
    maxLength?: number;
    error?: string;
    note?: string;
  }
  export function VerifyField(props: VerifyFieldProps): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { StateChip } from './StateChip';
import type { StatusTone } from '../theme/tokens';

export type VerificationState = 'UNVERIFIED' | 'CODE_SENT' | 'VERIFYING' | 'VERIFIED' | 'FAILED';

const STATE_LABEL: Record<VerificationState, string> = {
  UNVERIFIED: 'Not verified',
  CODE_SENT: 'Code sent',
  VERIFYING: 'Verifying',
  VERIFIED: 'Verified',
  FAILED: 'Verification failed',
};

const STATE_TONE: Record<VerificationState, StatusTone> = {
  UNVERIFIED: 'neutral',
  CODE_SENT: 'caution',
  VERIFYING: 'caution',
  VERIFIED: 'good',
  FAILED: 'bad',
};

export interface VerifyFieldProps {
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  code: string;
  onCodeChange: (next: string) => void;
  state: VerificationState;
  onSend: () => void;
  onVerify: () => void;
  placeholder?: string;
  /** "OTP" for a mobile number, "code" for WhatsApp — the team says both. */
  codeLabel?: string;
  maxLength?: number;
  error?: string;
  note?: string;
}

/**
 * One identity field that has to be proved, not just typed: the number, the
 * code that was sent to it, and where that round-trip has got to.
 *
 * It is a component because a rider cannot be deployed until five of these
 * read VERIFIED, and that gate is only trustworthy if all five report their
 * state the same way. The caller owns the state machine — this draws it and
 * locks the inputs once VERIFIED so a verified number cannot be edited out
 * from under its own proof.
 */
export function VerifyField({
  label,
  value,
  onValueChange,
  code,
  onCodeChange,
  state,
  onSend,
  onVerify,
  placeholder,
  codeLabel = 'OTP',
  maxLength,
  error,
  note,
}: VerifyFieldProps) {
  const verified = state === 'VERIFIED';
  const busy = state === 'VERIFYING';

  return (
    <Box
      sx={{
        p: '14px 14px 12px',
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <Typography variant="overline">{label}</Typography>

      <TextField
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        disabled={verified}
        error={Boolean(error)}
        helperText={error}
        slotProps={{ htmlInput: { inputMode: 'numeric', maxLength } }}
      />

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <TextField
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder={`Enter ${codeLabel}`}
          disabled={verified || state === 'UNVERIFIED'}
          sx={{ flex: 1 }}
        />
        <Button variant="outlined" onClick={onSend} disabled={verified || busy || !value}>
          {state === 'UNVERIFIED' ? `Send ${codeLabel}` : `Resend ${codeLabel}`}
        </Button>
        <Button variant="outlined" onClick={onVerify} disabled={verified || busy || !code}>
          Verify
        </Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <StateChip label={STATE_LABEL[state]} tone={STATE_TONE[state]} />
        {note && <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{note}</Typography>}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Manual check**

Temporarily render one `VerifyField` on `/vehicles` with local `useState`. Confirm: the code input is disabled until Send is pressed; both buttons and both inputs go disabled once `state` is `VERIFIED`; the chip reads "Verified" in the `good` tone. Remove the temporary render before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/VerifyField.tsx
git commit -m "feat(components): add VerifyField for OTP-proved identity fields"
```

---

### Task 2: `StepSection`

**Files:**
- Create: `frontend/app/src/components/StepSection.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export function StepSection(props: {
    step: number;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { accent, base } from '../theme/tokens';

/**
 * A numbered section of a long form.
 *
 * Deliberately not a MUI `Stepper`: the prototype lets the operator fill step
 * five before step two, because a rider standing at the counter volunteers
 * their details in whatever order they like. Every step stays visible and
 * editable; the number is orientation, not a gate.
 */
export function StepSection({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      sx={{
        background: base.surface,
        borderRadius: 2,
        p: { xs: '16px 14px 14px', sm: '18px 20px 16px' },
      }}
    >
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', mb: 4 }}>
        <Box
          aria-hidden
          sx={{
            flex: '0 0 auto',
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            color: accent[100],
            background: accent[800],
          }}
        >
          {step}
        </Box>
        <Box>
          <Typography sx={{ fontSize: 15 }}>{title}</Typography>
          {subtitle && (
            <Typography sx={{ fontSize: 13, color: 'grey.500', mt: '2px' }}>{subtitle}</Typography>
          )}
        </Box>
      </Box>
      {children}
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/StepSection.tsx
git commit -m "feat(components): add StepSection for numbered non-blocking form steps"
```

---

### Task 3: `RecordSearchSelect`

**Files:**
- Create: `frontend/app/src/components/RecordSearchSelect.tsx`

**Interfaces:**
- Consumes: `useDebounced` from `src/hooks/useDebounced.ts`.
- Produces:
  ```ts
  export interface SearchableRecord {
    id: string;
    primary: string;
    secondary?: string;
    trailing?: string;
  }
  export function RecordSearchSelect(props: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (id: string) => void;
    options: readonly SearchableRecord[];
    loading?: boolean;
    error?: string;
    note?: string;
    emptyText?: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Confirm the debounce hook's signature**

```bash
cd frontend/app && cat src/hooks/useDebounced.ts
```

Note the exported name and argument order; the next step calls it.

- [ ] **Step 2: Write the component**

```tsx
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Mono } from './Mono';

export interface SearchableRecord {
  /** What the form actually submits. */
  id: string;
  primary: string;
  secondary?: string;
  trailing?: string;
}

/**
 * Pick a record by typing any of the things people remember about it — an id,
 * a name, a phone number, the bike it is holding — and submit its id.
 *
 * The prototype hangs a hidden id field beside every one of these searches for
 * exactly this reason: the operator searches by "Ramesh" and the request has
 * to carry `R014`. Keeping that pairing here means no form has to remember to
 * do it. Filtering is the caller's job — it owns the query and knows which
 * fields the server matches on.
 */
export function RecordSearchSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
  loading,
  error,
  note,
  emptyText = 'No matching records',
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (id: string) => void;
  options: readonly SearchableRecord[];
  loading?: boolean;
  error?: string;
  note?: string;
  emptyText?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <Box>
      <Autocomplete
        value={selected}
        onChange={(_, next) => onChange(next?.id ?? '')}
        options={options as SearchableRecord[]}
        loading={loading}
        noOptionsText={emptyText}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(o) => `${o.id} · ${o.primary}`}
        renderOption={(props, o) => (
          <Box component="li" {...props} key={o.id}>
            <Box sx={{ display: 'flex', width: '100%', gap: 3, alignItems: 'baseline' }}>
              <Mono sx={{ fontSize: 12 }}>{o.id}</Mono>
              <Typography sx={{ fontSize: 13, flex: 1 }}>{o.primary}</Typography>
              {o.secondary && (
                <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{o.secondary}</Typography>
              )}
              {o.trailing && <Mono sx={{ fontSize: 12, color: 'grey.500' }}>{o.trailing}</Mono>}
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            error={Boolean(error)}
            helperText={error}
          />
        )}
      />
      {note && !error && (
        <Typography sx={{ fontSize: 12, color: 'grey.500', mt: 2 }}>{note}</Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Replace the hand-rolled Autocomplete**

Open `frontend/app/src/pages/workshop/Inspection.tsx:127`. Swap the inline `Autocomplete` for `RecordSearchSelect`, mapping each vehicle to `{ id: v.id, primary: v.model, secondary: VEHICLE_STATE_LABEL[v.state], trailing: v.chassisNumber }`. This is the proof the interface is right — if the vehicle picker needs a prop that isn't there, add it now rather than after Abhiram builds against it.

- [ ] **Step 5: Manual check**

`npm run dev`, open `/inspections`, type a partial chassis number. The dropdown filters, picking a row fills the field, and the form still submits the vehicle id.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/components/RecordSearchSelect.tsx frontend/app/src/pages/workshop/Inspection.tsx
git commit -m "feat(components): add RecordSearchSelect and adopt it in Inspection"
```

---

### Task 4: `SelectionSummary` and `InfoStrip`

Two small surfaces, one task — neither carries enough weight for its own review, and Abhiram needs both before he can start.

**Files:**
- Create: `frontend/app/src/components/SelectionSummary.tsx`
- Create: `frontend/app/src/components/InfoStrip.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface SummaryItem { label: string; value: React.ReactNode }
  export function SelectionSummary(props: {
    title: string;
    hint?: string;
    items?: readonly SummaryItem[];
  }): JSX.Element;

  export function InfoStrip(props: {
    children: React.ReactNode;
    tone?: 'accent' | 'caution';
  }): JSX.Element;
  ```

- [ ] **Step 1: Write `SelectionSummary`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { base } from '../theme/tokens';

export interface SummaryItem {
  label: string;
  value: ReactNode;
}

/**
 * What was just picked, and what follows from it.
 *
 * On an exchange or a deboard the operator picks a rider and the consequences
 * are elsewhere on the form — which bike comes back, what it is worth, what is
 * owed. This puts them in one line above the commit button, which is the last
 * place a wrong pick can still be caught. With no items it shows the prompt,
 * so the space does not jump when the pick lands.
 */
export function SelectionSummary({
  title,
  hint,
  items,
}: {
  title: string;
  hint?: string;
  items?: readonly SummaryItem[];
}) {
  return (
    <Box sx={{ background: base.surface, borderRadius: 2, p: '14px 16px 12px' }}>
      <Typography sx={{ fontSize: 15 }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: 13, color: 'grey.500', mt: '2px' }}>{hint}</Typography>}
      {items && items.length > 0 && (
        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${Math.min(items.length, 4)}, 1fr)` },
            gap: 3,
          }}
        >
          {items.map((i) => (
            <Box key={i.label}>
              <Typography variant="overline">{i.label}</Typography>
              <Box sx={{ fontSize: 14, mt: '2px' }}>{i.value}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Write `InfoStrip`**

```tsx
import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { status } from '../theme/tokens';

/**
 * A rule, stated where it applies.
 *
 * Phase 1 says: nothing invented where a rule is unknown — show the field, add
 * a visible note, leave the logic out. Those notes are the record of what we
 * were told and what we refused to guess, so they get one consistent
 * treatment rather than a stray line of grey text per screen.
 */
export function InfoStrip({
  children,
  tone = 'accent',
}: {
  children: ReactNode;
  tone?: 'accent' | 'caution';
}) {
  const { fg, bg } = status[tone];
  return (
    <Box
      sx={{
        background: bg,
        color: fg,
        borderRadius: 2,
        p: '10px 14px',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {children}
    </Box>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/SelectionSummary.tsx frontend/app/src/components/InfoStrip.tsx
git commit -m "feat(components): add SelectionSummary and InfoStrip"
```

---

### Task 5: `DerivedField`

**Files:**
- Create: `frontend/app/src/components/DerivedField.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function DerivedField(props: {
    label: string;
    value: string;
    /** How the figure was arrived at, e.g. "Plan ₹10,000 − paid ₹4,000". */
    derivation?: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

```tsx
import TextField from '@mui/material/TextField';

/**
 * A field the operator reads rather than fills.
 *
 * The prototype labels one of these "Security Deposit Pending (Auto
 * Calculated)" — the parenthesis is doing real work, because a box that looks
 * like an input invites someone to correct the arithmetic. It is a read-only
 * TextField, not plain text, so it keeps its place in the form grid; and it
 * shows its own derivation, so a figure that looks wrong can be argued with.
 */
export function DerivedField({
  label,
  value,
  derivation,
}: {
  label: string;
  value: string;
  derivation?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      helperText={derivation}
      slotProps={{ input: { readOnly: true } }}
      sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/components/DerivedField.tsx
git commit -m "feat(components): add DerivedField for computed read-only figures"
```

---

### Task 6: `FlowStrip` and `MethodTabs`

**Files:**
- Create: `frontend/app/src/components/FlowStrip.tsx`
- Create: `frontend/app/src/components/MethodTabs.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function FlowStrip(props: {
    stages: readonly string[];
    /** Index of the stage in progress; earlier ones read as done. */
    activeIndex?: number;
  }): JSX.Element;

  export interface EntryMethod { value: string; label: string; /** Stored on the record as its provenance. */ dataSource: string }
  export function MethodTabs(props: {
    methods: readonly EntryMethod[];
    value: string;
    onChange: (value: string) => void;
    children: React.ReactNode;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write `FlowStrip`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { accent, neutral, status } from '../theme/tokens';

/**
 * The stages of a process that has not started yet.
 *
 * Both places this appears — a spreadsheet import and a camera scan — are
 * multi-stage and irreversible-feeling, and the prototype answers the same
 * question in both: how many more times will this ask me something before it
 * commits. It wraps rather than scrolls, so a six-stage chain survives a phone.
 */
export function FlowStrip({
  stages,
  activeIndex,
}: {
  stages: readonly string[];
  activeIndex?: number;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      {stages.map((s, i) => {
        const done = activeIndex !== undefined && i < activeIndex;
        const active = activeIndex === i;
        return (
          <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                fontSize: 12,
                px: 2,
                py: '3px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                color: active ? accent[100] : done ? status.good.fg : neutral[400],
                background: active ? accent[800] : done ? status.good.bg : neutral[900],
              }}
            >
              {s}
            </Box>
            {i < stages.length - 1 && (
              <Typography aria-hidden sx={{ fontSize: 12, color: 'grey.700' }}>
                →
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: Write `MethodTabs`**

```tsx
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface EntryMethod {
  value: string;
  label: string;
  /** Written onto the saved record so its provenance survives. */
  dataSource: string;
}

/**
 * Three ways to get the same record in: typed, imported, or read off a label
 * by camera.
 *
 * The prototype repeats one instruction next to each of them — "Data source
 * should be stored as: Spreadsheet Import" / "AI Scan" / "Manual Entry". That
 * is a provenance requirement, not decoration: a chassis number an OCR guessed
 * is not a chassis number a person read out, and six months on somebody will
 * need to know which. So the method carries its own `dataSource` and this
 * component keeps it visible while the form is being filled.
 */
export function MethodTabs({
  methods,
  value,
  onChange,
  children,
}: {
  methods: readonly EntryMethod[];
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const current = methods.find((m) => m.value === value);
  return (
    <Box>
      <Tabs
        value={value}
        onChange={(_, next: string) => onChange(next)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}
      >
        {methods.map((m) => (
          <Tab key={m.value} value={m.value} label={m.label} sx={{ fontSize: 13, minHeight: 40 }} />
        ))}
      </Tabs>
      {children}
      {current && (
        <Typography sx={{ fontSize: 12, color: 'grey.500', mt: 4 }}>
          Data source recorded as: {current.dataSource}
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/FlowStrip.tsx frontend/app/src/components/MethodTabs.tsx
git commit -m "feat(components): add FlowStrip and MethodTabs"
```

---

### Task 7: `UploadBox` and adopt it plus `FlowStrip` in bulk upload

**Files:**
- Create: `frontend/app/src/components/UploadBox.tsx`
- Modify: `frontend/app/src/pages/vehicles/BulkUploadVehicles.tsx`

**Interfaces:**
- Consumes: `FlowStrip` from Task 6.
- Produces:
  ```ts
  export function UploadBox(props: {
    title: string;
    description: string;
    accept: string;
    buttonLabel: string;
    onFile: (file: File) => void;
    expectedColumns?: readonly string[];
    columnNote?: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useRef } from 'react';
import { neutral } from '../theme/tokens';

/**
 * Where a file goes in, and what it has to contain.
 *
 * The expected-column list is the point. The prototype's note — "allow field
 * mapping if source column names differ" — is really an admission that the
 * spreadsheets arriving from the hubs do not agree with each other, so telling
 * somebody the columns we want *before* they upload is what stops the mapping
 * step becoming the whole job. Native input, hidden, driven by the button, so
 * the keyboard reaches it.
 */
export function UploadBox({
  title,
  description,
  accept,
  buttonLabel,
  onFile,
  expectedColumns,
  columnNote,
}: {
  title: string;
  description: string;
  accept: string;
  buttonLabel: string;
  onFile: (file: File) => void;
  expectedColumns?: readonly string[];
  columnNote?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <Box>
      <Box
        sx={{
          border: `1px dashed ${neutral[700]}`,
          borderRadius: 2,
          p: { xs: 5, sm: 7 },
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: 15 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: 'grey.500', mt: 2, mb: 4 }}>{description}</Typography>
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <Button variant="contained" onClick={() => input.current?.click()}>
          {buttonLabel}
        </Button>
      </Box>

      {expectedColumns && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="overline">Expected columns</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
            {expectedColumns.map((c) => (
              <Box
                key={c}
                sx={{
                  fontSize: 12,
                  px: 2,
                  py: '3px',
                  borderRadius: '4px',
                  background: neutral[900],
                  color: neutral[300],
                }}
              >
                {c}
              </Box>
            ))}
          </Box>
          {columnNote && (
            <Typography sx={{ fontSize: 12, color: 'grey.500', mt: 3 }}>{columnNote}</Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Adopt both in the bulk upload page**

In `BulkUploadVehicles.tsx`, put a `FlowStrip` under the page header with the prototype's exact stages, and swap the file control for `UploadBox`:

```tsx
const IMPORT_STAGES = [
  'Upload',
  'Map columns',
  'Validate',
  'Duplicate check',
  'Preview',
  'Confirm import',
] as const;

const EXPECTED_COLUMNS = [
  'Vehicle ID',
  'Chassis number',
  'IoT number',
  'Controller number',
  'Motor number',
  'Battery type',
  'Vehicle make',
  'Model',
  'Purchase date',
] as const;
```

Drive `activeIndex` from the page's existing state: `0` before a file is chosen, `4` once a preview is loaded, `5` while committing.

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Manual check**

`/vehicles/bulk-upload`: the strip shows six stages with "Upload" active; choosing a file advances it to "Preview"; the expected-column chips list all nine fields.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/components/UploadBox.tsx frontend/app/src/pages/vehicles/BulkUploadVehicles.tsx
git commit -m "feat(vehicles): add UploadBox and show the import stages on bulk upload"
```

---

### Task 8: `QueueBox` and `NumberedList`

**Files:**
- Create: `frontend/app/src/components/QueueBox.tsx`
- Create: `frontend/app/src/components/NumberedList.tsx`

**Interfaces:**
- Consumes: `StatusTone` from `src/theme/tokens.ts`.
- Produces:
  ```ts
  export interface QueueRow {
    label: string;
    count: number;
    tone?: StatusTone;
    /** Where the count leads. A row that counts a set must open that set. */
    to: string;
  }
  export function QueueBox(props: { heading: string; rows: readonly QueueRow[] }): JSX.Element;

  export interface NumberedListRow { label: string; hint: string; to?: string }
  export function NumberedList(props: { rows: readonly NumberedListRow[] }): JSX.Element;
  ```

- [ ] **Step 1: Write `QueueBox`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { Mono } from './Mono';
import { base, neutral, status, type StatusTone } from '../theme/tokens';

export interface QueueRow {
  label: string;
  count: number;
  tone?: StatusTone;
  /** Where the count leads — a row that counts a set must open that set. */
  to: string;
}

/**
 * A named group of work queues, each with its size.
 *
 * Service Management and Recovery Summary are both this shape: a heading over
 * a stack of "what is stuck here, and how much of it". Sixteen such rows
 * across four boxes, so they get one component rather than four hand-built
 * lists that drift apart on the second change of mind. Rows are anchors, not
 * click handlers — the count is a promise the operator can middle-click.
 */
export function QueueBox({ heading, rows }: { heading: string; rows: readonly QueueRow[] }) {
  return (
    <Box sx={{ background: base.surface, borderRadius: 2, p: '16px 18px 14px' }}>
      <Typography variant="overline">{heading}</Typography>
      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <Box
            key={r.label}
            component={Link}
            to={r.to}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 3,
              py: 3,
              px: 2,
              mx: -2,
              borderRadius: 1,
              color: 'inherit',
              textDecoration: 'none',
              borderTop: `1px solid ${neutral[900]}`,
              '&:first-of-type': { borderTop: 'none' },
              '&:hover': { background: neutral[900] },
            }}
          >
            <Typography sx={{ fontSize: 13 }}>{r.label}</Typography>
            <Mono sx={{ fontSize: 16, color: r.tone ? status[r.tone].fg : 'text.primary' }}>
              {r.count}
            </Mono>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Write `NumberedList`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { neutral } from '../theme/tokens';

export interface NumberedListRow {
  label: string;
  /** The trail behind the label, e.g. "Under repair · Major". */
  hint: string;
  to?: string;
}

/**
 * Label-and-trail rows: a thing, and where it came from.
 *
 * The prototype's part-usage list spells out what it is reaching for — "Part →
 * Usage → Vehicle → Service Ticket / Job Card". Until those links exist the
 * row can only state the trail; the shape is here so that when they do, the
 * row becomes a link and nothing else changes.
 */
export function NumberedList({ rows }: { rows: readonly NumberedListRow[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r) => (
        <Box
          key={r.label}
          {...(r.to ? { component: Link, to: r.to } : {})}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 3,
            py: 3,
            color: 'inherit',
            textDecoration: 'none',
            borderTop: `1px solid ${neutral[900]}`,
            '&:first-of-type': { borderTop: 'none' },
            '&:hover': r.to ? { background: neutral[900] } : undefined,
          }}
        >
          <Typography sx={{ fontSize: 14 }}>{r.label}</Typography>
          <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{r.hint}</Typography>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/QueueBox.tsx frontend/app/src/components/NumberedList.tsx
git commit -m "feat(components): add QueueBox and NumberedList"
```

---

### Task 9: `PeriodToggle`

**Files:**
- Create: `frontend/app/src/components/PeriodToggle.tsx`

**Interfaces:**
- Consumes: `dayjs` (already a dependency).
- Produces:
  ```ts
  export type PeriodGrain = 'DAY' | 'WEEK' | 'MONTH';
  export interface ResolvedPeriod { grain: PeriodGrain; startIso: string; endIso: string; label: string }
  export function resolvePeriod(grain: PeriodGrain, anchorIso: string): ResolvedPeriod;
  export function PeriodToggle(props: {
    grain: PeriodGrain;
    anchorIso: string;
    onChange: (next: { grain: PeriodGrain; anchorIso: string }) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the component and the range function**

```tsx
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import dayjs from 'dayjs';
import { formatDate } from '../lib/format';

export type PeriodGrain = 'DAY' | 'WEEK' | 'MONTH';

export interface ResolvedPeriod {
  grain: PeriodGrain;
  startIso: string;
  endIso: string;
  label: string;
}

/**
 * The range a grain and an anchor date actually mean.
 *
 * Exported separately from the control because the figures on Today's
 * Operations are filtered by this range, and a screen should not have to
 * re-derive it from the toggle's props. Weeks run Wednesday to Tuesday, which
 * is Ashok's billing week, not the calendar's — `dayjs().startOf('week')` is
 * wrong here and would quietly mis-slice every weekly total.
 */
export function resolvePeriod(grain: PeriodGrain, anchorIso: string): ResolvedPeriod {
  const anchor = dayjs(anchorIso);

  if (grain === 'DAY') {
    const iso = anchor.format('YYYY-MM-DD');
    return { grain, startIso: iso, endIso: iso, label: formatDate(iso) };
  }

  if (grain === 'WEEK') {
    // Wednesday is day 3. Step back to the most recent Wednesday, inclusive.
    const back = (anchor.day() - 3 + 7) % 7;
    const start = anchor.subtract(back, 'day');
    const end = start.add(6, 'day');
    return {
      grain,
      startIso: start.format('YYYY-MM-DD'),
      endIso: end.format('YYYY-MM-DD'),
      label: `${formatDate(start.format('YYYY-MM-DD'))} → ${formatDate(end.format('YYYY-MM-DD'))}`,
    };
  }

  const start = anchor.startOf('month');
  const end = anchor.endOf('month');
  return {
    grain,
    startIso: start.format('YYYY-MM-DD'),
    endIso: end.format('YYYY-MM-DD'),
    label: anchor.format('MMMM YYYY'),
  };
}

/** Day / week / month, plus the date the range hangs off. */
export function PeriodToggle({
  grain,
  anchorIso,
  onChange,
}: {
  grain: PeriodGrain;
  anchorIso: string;
  onChange: (next: { grain: PeriodGrain; anchorIso: string }) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={grain}
        onChange={(_, next: PeriodGrain | null) => next && onChange({ grain: next, anchorIso })}
      >
        <ToggleButton value="DAY">Day</ToggleButton>
        <ToggleButton value="WEEK">Week</ToggleButton>
        <ToggleButton value="MONTH">Month</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        type="date"
        value={anchorIso}
        onChange={(e) => onChange({ grain, anchorIso: e.target.value })}
        sx={{ width: 170 }}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Manual check of the week boundary**

Temporarily log `resolvePeriod('WEEK', '2026-09-07')` (a Monday). Expected `startIso: '2026-09-02'` (the Wednesday before) and `endIso: '2026-09-08'`. Also check a Wednesday anchor returns itself as the start. Remove the log.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/components/PeriodToggle.tsx
git commit -m "feat(components): add PeriodToggle with Wednesday-anchored weeks"
```

---

### Task 10: Widen the vehicle contract — `RECOVERY`, battery vendor, scrapped label

**Files:**
- Modify: `frontend/app/src/types/vehicle.ts`
- Modify: `frontend/app/src/lib/labels.ts`
- Modify: `frontend/app/src/mocks/vehicles.ts`

**Interfaces:**
- Produces: `VEHICLE_STATES` gains `'RECOVERY'`; `Vehicle` gains `batteryVendor: string | null`; `VehicleDetail` gains `iotNumber: string | null`; `BATTERY_VENDORS` and `VEHICLE_MAKES` exported from `src/lib/labels.ts`.

- [ ] **Step 1: Add the state and the fields**

In `src/types/vehicle.ts`, insert `'RECOVERY'` into `VEHICLE_STATES` between `'RETURNED'` and `'UNDER_REPAIR'`, and extend the interfaces:

```ts
export interface Vehicle {
  // ...existing fields...
  batteryType: BatteryType;
  /**
   * Whose swap network the pack belongs to — Sun Mobility, Battery Smart,
   * Yuma, Honda Swap. Distinct from `batteryType`: the type says whether a
   * pack comes out, the vendor says where it can be exchanged, and a
   * breakdown needs the second one. Free text because the list of networks
   * changes faster than the repo does.
   */
  batteryVendor: string | null;
}
```

```ts
export interface VehicleDetail extends Vehicle {
  // ...existing fields...
  /** Telematics unit id. Printed on the bike; searched by the hubs. */
  iotNumber: string | null;
}
```

- [ ] **Step 2: Add the vocabulary**

In `src/lib/labels.ts`, add `RECOVERY` to both `VEHICLE_STATE_LABEL` (`'Recovery'`) and `VEHICLE_STATE_TONE` (`'warn'`), relabel `RETIRED` to `'Scrapped'`, add `RECOVERY` to `VEHICLE_TRANSITIONS`, and add the two vendor lists:

```ts
  RETURNED: ['UNDER_REPAIR', 'QC_PENDING', 'READY_TO_DEPLOY'],
  // A bike in recovery has been taken back off a rider who would not return
  // it. Where it goes next depends on what state it comes back in, which is
  // not known until it is in front of a mechanic — so every workshop route is
  // open, plus a straight write-off.
  RECOVERY: ['UNDER_REPAIR', 'QC_PENDING', 'READY_TO_DEPLOY', 'RETIRED'],
```

```ts
/** Today's swap networks. A price list, not a schema — hence not an enum. */
export const BATTERY_VENDORS = [
  'Sun Mobility',
  'Battery Smart',
  'Yuma',
  'Honda Swap',
] as const;

/** Today's OEMs, same reasoning. */
export const VEHICLE_MAKES = ['e-Sprinto', 'OPG Mobility', 'Odysee', 'Stella'] as const;
```

`DEPLOYED` must also gain `'RECOVERY'` as a legal next state — a bike is taken into recovery straight off a rider:

```ts
  DEPLOYED: ['RETURNED', 'ACCIDENT', 'RECOVERY'],
```

- [ ] **Step 3: Fix the fixtures**

`npm run build` will now fail on `src/mocks/vehicles.ts` for every missing `batteryVendor` and `iotNumber`. Populate them from the seed — pick a vendor consistent with each bike's `batteryType` (a `FIXED` pack gets `null`), and give each vehicle an IoT number in the seed's existing id style. Put a handful of bikes into `RECOVERY` so the new view has rows.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/vehicles`: a Recovery facet chip appears with a non-zero count, chips are coloured `warn`, and the Retired chip now reads "Scrapped".

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/types/vehicle.ts frontend/app/src/lib/labels.ts frontend/app/src/mocks/vehicles.ts
git commit -m "feat(types): add RECOVERY state, battery vendor and IoT number"
```

---

### Task 11: Widen the rider and assignment contracts

Abhiram's screens are blocked on this. It ships before Tasks 14–19 start.

**Files:**
- Modify: `frontend/app/src/types/rider.ts`
- Modify: `frontend/app/src/types/assignment.ts`
- Modify: `frontend/app/src/lib/labels.ts`
- Modify: `frontend/app/src/mocks/riders.ts`

**Interfaces:**
- Consumes: `VehicleState` from `src/types/vehicle.ts` (Task 10).
- Produces:
  ```ts
  export type PaymentDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  export type DeboardReason =
    | 'RECOVERED_BY_TEAM' | 'ACCIDENT' | 'LEFT_AT_HUB' | 'LEFT_AT_ROADSIDE'
    | 'SERVICE_ISSUE' | 'PAYMENT_ISSUE' | 'WENT_HOME' | 'RETURNED' | 'OTHER';
  export interface RiderVerification { aadhaarVerified: boolean; primaryVerified: boolean; whatsappVerified: boolean; alternate1Verified: boolean; alternate2Verified: boolean }
  // OnboardRiderRequest gains the prototype's fields; DeboardRiderRequest and
  // ExchangeVehicleRequest gain `reason`/`nextVehicleState`.
  export const DEBOARD_REASON_LABEL: Record<DeboardReason, string>;
  export const PAYMENT_DAY_LABEL: Record<PaymentDay, string>;
  export const WEEKLY_PLAN_TIERS: readonly number[];   // paise
  export const DEPOSIT_TIERS: readonly number[];       // paise
  export const WORKING_PLATFORMS: readonly string[];
  ```

- [ ] **Step 1: Extend `src/types/rider.ts`**

```ts
/**
 * The day this rider says they pay.
 *
 * NOT the billing period. `BillingDay` above drives the Monday and Wednesday
 * runs, and the prototype's payment view is fixed Wednesday→Tuesday — yet its
 * rider form offers all seven days. Those two cannot both be true, so this is
 * captured and displayed and feeds no calculation until Ashok says which wins.
 * See the contract table in docs/superpowers/plans/2026-09-07-prototype-ui-components.md.
 */
export type PaymentDay =
  | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY'
  | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** Which of the five identity fields have completed their OTP round-trip. */
export interface RiderVerification {
  aadhaarVerified: boolean;
  primaryVerified: boolean;
  whatsappVerified: boolean;
  alternate1Verified: boolean;
  alternate2Verified: boolean;
}

export interface OnboardRiderRequest {
  // Identity — step 1. Aadhaar is the record the team actually trusts.
  aadhaarNumber: string;
  name: string;
  permanentAddress: string;

  // Contact — step 2. Four numbers because one rider is reachable on none of
  // them by the time a bike needs recovering.
  phone: string;
  whatsappNumber: string;
  alternateNumber1: string;
  alternateNumber2: string;

  // Local address — step 3.
  localAddress: string;
  city: string;
  state: string;
  pinCode: string;
  /** "12.892425,77.649213" as captured on the phone. */
  locationCoordinates: string | null;

  // Optional documents — step 4.
  panNumber: string | null;
  drivingLicence: string | null;

  // Commercial — step 5.
  workingPlatform: string;
  platformRiderId: string | null;
  planAmount: Paise;
  billingDay: BillingDay;
  /** Captured, not acted on. See PaymentDay. */
  paymentDay: PaymentDay;
  depositPlan: Paise;
  depositPaid: Paise;
  onboardedOn: Iso8601;

  /** Every flag must be true before the request is allowed to be sent. */
  verification: RiderVerification;

  /**
   * The bike handed over at the counter. Optional: the prototype assigns one
   * during onboarding, but our contract keeps assignment a separate recorded
   * event, so a rider can still be registered with nothing to ride.
   */
  vehicleId: string | null;
}
```

Also add to `Rider` the two fields its list and detail screens now show: `workingPlatform: string` and `paymentDay: PaymentDay`.

- [ ] **Step 2: Split reason from next state in `src/types/assignment.ts`**

```ts
import type { VehicleState } from './vehicle';

/**
 * Why a rider gave the bike back.
 *
 * Separate from `ReturnCondition`, which is what shape the bike is in. "Went
 * to hometown" and "Minor damage" are answers to different questions, and the
 * prototype asks both — a reason and an explicit next status — because the
 * operator routinely overrides the obvious routing. Collapsing them would make
 * that override impossible to express.
 */
export type DeboardReason =
  | 'RECOVERED_BY_TEAM'
  | 'ACCIDENT'
  | 'LEFT_AT_HUB'
  | 'LEFT_AT_ROADSIDE'
  | 'SERVICE_ISSUE'
  | 'PAYMENT_ISSUE'
  | 'WENT_HOME'
  | 'RETURNED'
  | 'OTHER';
```

Add to `DeboardRiderRequest`:

```ts
  reason: DeboardReason;
  /** Defaulted from `returnCondition`, overridable by the operator. */
  nextVehicleState: VehicleState;
```

Add the same `nextVehicleState` to `ExchangeVehicleRequest` — the prototype's "Old Vehicle Next Status" — and widen `ExchangeReason` with the two values it offers that we lack:

```ts
export type ExchangeReason =
  | 'BREAKDOWN'
  | 'BATTERY_ISSUE'
  | 'ACCIDENT'
  | 'SERVICE_REQUIRED'
  | 'RIDER_REQUEST'
  | 'UPGRADE'
  | 'OTHER';
```

- [ ] **Step 3: Add the vocabulary to `src/lib/labels.ts`**

```ts
export const DEBOARD_REASON_LABEL: Record<DeboardReason, string> = {
  RECOVERED_BY_TEAM: 'Recovered by team',
  ACCIDENT: 'Accident',
  LEFT_AT_HUB: 'Rider left it at the hub',
  LEFT_AT_ROADSIDE: 'Rider left it at the roadside',
  SERVICE_ISSUE: 'Service issue',
  PAYMENT_ISSUE: 'Payment issue',
  WENT_HOME: 'Gone to hometown',
  RETURNED: 'Returned',
  OTHER: 'Other',
};

export const PAYMENT_DAY_LABEL: Record<PaymentDay, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

/**
 * Today's price list, in paise, offered as suggestions in a combobox that
 * still accepts a typed amount. Not an enum: a tier change would otherwise be
 * a repo change, and Ashok changes them.
 */
export const WEEKLY_PLAN_TIERS = [179900, 189900, 199900, 209900, 219900] as const;
export const DEPOSIT_TIERS = [500000, 1000000] as const;

/** The gig platforms riders work for. Free text is allowed alongside. */
export const WORKING_PLATFORMS = [
  'Zomato', 'Swiggy', 'Ownly', 'EatSure', 'EatClub', 'Zepto', 'Blinkit',
  'Swiggy Instamart', 'Flipkart Minutes', 'BigBasket (BB Now)', 'Porter',
  'Borzo', 'Dunzo', 'Tata 1mg', 'PharmEasy', 'Apollo 247',
] as const;

/** The obvious next state for a bike in a given condition — a default, not a rule. */
export const CONDITION_DEFAULT_STATE: Record<ReturnCondition, VehicleState> = {
  NONE: 'QC_PENDING',
  MINOR: 'UNDER_REPAIR',
  MAJOR: 'UNDER_REPAIR',
  ACCIDENT: 'ACCIDENT',
};
```

Also add the exchange reason labels for the three new values.

- [ ] **Step 4: Fix the fixtures**

`npm run build` will fail on `src/mocks/riders.ts` for the two new `Rider` fields. Give every rider a `workingPlatform` drawn from `WORKING_PLATFORMS` and a `paymentDay`.

- [ ] **Step 5: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0. Note which of Abhiram's screens now fail typecheck — those are exactly Tasks 15–19, and they are expected to fail until he does them. If the build cannot be made green without touching his files, stop and hand the type change over rather than editing `src/pages/riders/` or `src/pages/assignments/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/types/rider.ts frontend/app/src/types/assignment.ts frontend/app/src/lib/labels.ts frontend/app/src/mocks/riders.ts
git commit -m "feat(types): expand rider identity, split deboard reason from next state"
```

- [ ] **Step 7: Tell Abhiram**

Post the new `OnboardRiderRequest`, `DeboardReason`, `nextVehicleState` and the widened `ExchangeReason` in the PR description, and name the six components he now has (Tasks 1–5). He is unblocked at this point.

---

### Task 12: `OcrFieldGrid` and the camera tab on Add Vehicle

**Files:**
- Create: `frontend/app/src/pages/vehicles/_components/OcrFieldGrid.tsx`
- Modify: `frontend/app/src/pages/vehicles/AddVehicle.tsx`

**Interfaces:**
- Consumes: `MethodTabs`, `FlowStrip` (Task 6), `UploadBox` (Task 7), `InfoStrip` (Task 4), `BATTERY_VENDORS`, `VEHICLE_MAKES` (Task 10).
- Produces: `export function OcrFieldGrid(props: { fields: readonly string[] }): JSX.Element;`

- [ ] **Step 1: Write `OcrFieldGrid`**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { base } from '../../../theme/tokens';

/**
 * Which numbers on a bike a photo can read.
 *
 * Page-local on purpose: it names vehicle fields, and no other screen has a
 * camera. If riders ever get Aadhaar-by-photo this moves to src/components —
 * not before.
 */
export function OcrFieldGrid({ fields }: { fields: readonly string[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        gap: 3,
      }}
    >
      {fields.map((f) => (
        <Box key={f} sx={{ background: base.surface, borderRadius: 2, p: '12px 14px 10px' }}>
          <Typography sx={{ fontSize: 14 }}>{f}</Typography>
          <Typography sx={{ fontSize: 12, color: 'grey.500', mt: '2px' }}>
            Readable from a photo
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Wrap Add Vehicle in `MethodTabs`**

Three methods, with the prototype's provenance strings:

```tsx
const METHODS = [
  { value: 'manual', label: 'Manual entry', dataSource: 'Manual entry' },
  { value: 'sheet', label: 'Upload spreadsheet', dataSource: 'Spreadsheet import' },
  { value: 'ai', label: 'Camera + AI detection', dataSource: 'AI scan' },
] as const;

const OCR_FIELDS = [
  'Vehicle ID',
  'Chassis number',
  'IoT number',
  'Controller number',
  'Motor number',
] as const;

const OCR_STAGES = [
  'Take photo',
  'AI reads the text',
  'Identify field',
  'Review and edit',
  'Confirm',
  'Populate record',
] as const;
```

The existing form becomes the `manual` panel. The `sheet` panel is a link to `/vehicles/bulk-upload` plus a one-line explanation — do not duplicate the importer. The `ai` panel is `FlowStrip` + `OcrFieldGrid` + the disabled camera buttons, under this `InfoStrip`, which is the prototype's own instruction and is the whole point of the tab:

```tsx
<InfoStrip tone="caution">
  AI and OCR never save a detected number on their own. Every field is shown for review
  and can be corrected before the record is created.
</InfoStrip>
```

Also add the two vendor selects to the manual form: Battery vendor from `BATTERY_VENDORS`, Vehicle make from `VEHICLE_MAKES`, and an IoT number field. Extend the Zod schema in `src/lib/schemas/vehicle.ts` to match — `batteryVendor` and `iotNumber` optional, since a fixed-battery bike has no vendor.

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Manual check**

`/vehicles/new`: three tabs; the manual tab still saves a vehicle and the "Data source recorded as: Manual entry" line is present; the AI tab shows six stages, five field cards and the review warning; the spreadsheet tab links to the importer.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/pages/vehicles/_components/OcrFieldGrid.tsx frontend/app/src/pages/vehicles/AddVehicle.tsx frontend/app/src/lib/schemas/vehicle.ts
git commit -m "feat(vehicles): add entry-method tabs, battery vendor and the camera scan panel"
```

---

### Task 13: Scrap Vehicle screen

**Files:**
- Create: `frontend/app/src/pages/vehicles/ScrapVehicle.tsx`
- Modify: `frontend/app/src/app/nav.ts`
- Modify: `frontend/app/src/app/router.tsx`
- Modify: `frontend/app/src/lib/api/vehicles.ts`

**Interfaces:**
- Consumes: `RecordSearchSelect` (Task 3), `SelectionSummary`, `InfoStrip` (Task 4), `DefinitionList`, `Panel`, `PageHeader`.
- Produces: `export interface ScrapVehicleRequest { vehicleId: string; scrappedOn: Iso8601; reason: string; salvageValue: Paise | null; note?: string }` in `src/types/vehicle.ts`, and `scrapVehicle(req)` in `src/lib/api/vehicles.ts`.

- [ ] **Step 1: Add the request type and the mock endpoint**

`ScrapVehicleRequest` in `src/types/vehicle.ts`; `scrapVehicle` in `src/lib/api/vehicles.ts` following the existing mock-latency pattern in that file, moving the vehicle to `RETIRED` and refusing a bike that is `DEPLOYED`:

```ts
/**
 * Scrapping a bike a rider is still riding is not a disposition, it is a lost
 * bike. The rider has to be deboarded first, which is a different screen and a
 * different conversation.
 */
```

- [ ] **Step 2: Build the screen**

Search by vehicle id or chassis number with `RecordSearchSelect`; on a pick, `SelectionSummary` shows the bike's state and rider, and a `DefinitionList` shows the auto-filled master record; then scrap date, reason and salvage value, and a confirm. `InfoStrip` carries the prototype's own note: the record is retained and the disposition is audited.

- [ ] **Step 3: Add the route and the nav item**

`{ label: 'Scrap vehicle', path: '/vehicles/scrap', icon: DeleteOutlineIcon, owner: 'smk', artboard: 20 }` in the `Fleet` section, and the matching router entry. The nav comment in `nav.ts` says a screen cannot exist without a way to reach it — both go in this commit.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/vehicles/scrap`: searching a known chassis number fills the summary and the master panel; confirming moves the bike to Scrapped on `/vehicles`; picking a deployed bike shows the refusal rather than scrapping it.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/pages/vehicles/ScrapVehicle.tsx frontend/app/src/app/nav.ts frontend/app/src/app/router.tsx frontend/app/src/lib/api/vehicles.ts frontend/app/src/types/vehicle.ts
git commit -m "feat(vehicles): add the scrap vehicle disposition screen"
```

---

### Task 14: Rider identity and contact steps — ABHIRAM

Blocked on Tasks 1, 2, 11.

**Files:**
- Create: `frontend/app/src/pages/riders/_components/RiderIdentityStep.tsx`
- Create: `frontend/app/src/pages/riders/_components/RiderContactStep.tsx`
- Create: `frontend/app/src/pages/riders/_components/useRiderVerification.ts`

**Interfaces:**
- Consumes: `VerifyField`, `VerificationState` (Task 1); `StepSection` (Task 2); `RiderVerification` (Task 11).
- Produces:
  ```ts
  export type VerifiableField = 'aadhaar' | 'primary' | 'whatsapp' | 'alt1' | 'alt2';
  export function useRiderVerification(): {
    stateOf: (f: VerifiableField) => VerificationState;
    codeOf: (f: VerifiableField) => string;
    setCode: (f: VerifiableField, code: string) => void;
    send: (f: VerifiableField) => void;
    verify: (f: VerifiableField) => void;
    /** Resets a field to UNVERIFIED when its value is edited. */
    invalidate: (f: VerifiableField) => void;
    allVerified: boolean;
    asRequest: () => RiderVerification;
  };
  export function RiderIdentityStep(props: { step: number }): JSX.Element;
  export function RiderContactStep(props: { step: number }): JSX.Element;
  ```

- [ ] **Step 1: Write the verification hook**

One `Record<VerifiableField, VerificationState>` plus a codes record. `send` moves `UNVERIFIED → CODE_SENT`. `verify` moves `CODE_SENT → VERIFYING`, then after a short `setTimeout` to `VERIFIED` if the code is six digits and `FAILED` otherwise — a stand-in for the endpoint, and the mock API pattern in `src/lib/api/` is the model. `invalidate` is what keeps the gate honest: editing a verified number drops it back to `UNVERIFIED`, so `allVerified` cannot go stale.

Add a comment stating that the six-digit rule is a placeholder for an endpoint nobody has specified, per the Phase 1 rule.

- [ ] **Step 2: Write the two steps**

`RiderIdentityStep`: a `StepSection` holding one `VerifyField` for Aadhaar (`maxLength={12}`) beside `TextField`s for name and permanent address, both registered on the parent form.

`RiderContactStep`: a `StepSection` holding four `VerifyField`s in a two-column grid, labelled as the prototype numbers them — "01. Primary mobile number", "02. WhatsApp number", "03. Alternate number 1", "04. Alternate number 2" — with `codeLabel="code"` on WhatsApp and `maxLength={10}` on all four.

Both read the form via RHF context (`useFormContext`) rather than prop-drilled `control`, so the parent stays readable at six steps.

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/pages/riders/_components/
git commit -m "feat(riders): add the identity and contact verification steps"
```

---

### Task 15: Rider address and commercial steps — ABHIRAM

**Files:**
- Create: `frontend/app/src/pages/riders/_components/RiderAddressStep.tsx`
- Create: `frontend/app/src/pages/riders/_components/RiderCommercialStep.tsx`

**Interfaces:**
- Consumes: `StepSection` (Task 2), `DerivedField` (Task 5), `SelectField`, `WORKING_PLATFORMS`, `WEEKLY_PLAN_TIERS`, `DEPOSIT_TIERS`, `PAYMENT_DAY_LABEL` (Task 11), `rupeesWithSymbol` from `src/lib/format.ts`.
- Produces: `export function RiderAddressStep(props: { step: number }): JSX.Element;` and `export function RiderCommercialStep(props: { step: number }): JSX.Element;`

- [ ] **Step 1: Write `RiderAddressStep`**

Local address full-width, then city / state / PIN / coordinates in a four-up grid. Steps 3 and 4 of the prototype fold together here — PAN and driving licence are two optional fields and do not earn a section of their own; label them "(optional)" as the prototype does.

- [ ] **Step 2: Write `RiderCommercialStep`**

Working platform as an MUI `Autocomplete` with `freeSolo` over `WORKING_PLATFORMS` — that is what the prototype's "Enter Platform Name" escape hatch means, and `freeSolo` gets it without the show/hide of a second field. Then platform rider id, weekly plan as a `freeSolo` combobox over `WEEKLY_PLAN_TIERS`, payment day, deposit plan over `DEPOSIT_TIERS`, deposit paid, and:

```tsx
<DerivedField
  label="Security deposit pending"
  value={rupeesWithSymbol(Math.max(0, depositPlan - depositPaid))}
  derivation={`Plan ${rupeesWithSymbol(depositPlan)} − paid ${rupeesWithSymbol(depositPaid)}`}
/>
```

Put an `InfoStrip` beside payment day carrying the contract note verbatim: the weekly run is fixed Wednesday to Tuesday, this is recorded for the collections team and drives no calculation.

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/src/pages/riders/_components/
git commit -m "feat(riders): add the address and commercial onboarding steps"
```

---

### Task 16: Rebuild Onboard Rider — ABHIRAM

**Files:**
- Modify: `frontend/app/src/pages/riders/OnboardRider.tsx`
- Modify: `frontend/app/src/lib/schemas/rider.ts` (request SMK's review — it is under `src/lib/`)

**Interfaces:**
- Consumes: Tasks 14 and 15, `VehiclePicker` from `src/pages/assignments/VehiclePicker.tsx`, `InfoStrip` (Task 4).

- [ ] **Step 1: Extend the Zod schema**

Every field of the new `OnboardRiderRequest`. Aadhaar exactly 12 digits, the four numbers exactly 10, PIN exactly 6, PAN and licence optional. Coordinates optional and free text — the prototype shows a lat,long pair typed by hand and no format has been agreed.

- [ ] **Step 2: Assemble the six steps**

`FormProvider` around: `RiderIdentityStep` (1), `RiderContactStep` (2), `RiderAddressStep` (3), `RiderCommercialStep` (4), and a `StepSection` (5) wrapping `VehiclePicker` — reused, not rebuilt; it already queries `READY_TO_DEPLOY` only, which is the prototype's "Only vehicles currently in RFD status can be assigned".

An `InfoStrip` at the top carries the prototype's own two rules: the rider id is generated on deployment, and only RFD bikes can be assigned.

- [ ] **Step 3: Gate the submit**

The footer button is disabled unless `allVerified` from `useRiderVerification`. Beside it, in text, which fields are still outstanding — a bare disabled button with no reason is the thing an operator files a bug about.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/riders/onboard`: all six steps render and are editable in any order; Save is disabled until all five fields read Verified; editing a verified number re-disables it; a completed form creates a rider visible on `/riders` with the picked bike.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/pages/riders/OnboardRider.tsx frontend/app/src/lib/schemas/rider.ts
git commit -m "feat(riders): rebuild onboarding as the six-step verified flow"
```

---

### Task 17: `DispositionFields` — ABHIRAM

**Files:**
- Create: `frontend/app/src/pages/assignments/_components/DispositionFields.tsx`

**Interfaces:**
- Consumes: `SelectField`, `DEBOARD_REASON_LABEL`, `CONDITION_DEFAULT_STATE`, `VEHICLE_STATE_LABEL`, `VEHICLE_TRANSITIONS` (Tasks 10–11).
- Produces:
  ```ts
  export function DispositionFields<T extends FieldValues>(props: {
    control: Control<T>;
    reasonName: Path<T>;
    reasonLabel: string;
    reasonOptions: readonly SelectOption[];
    dateName: Path<T>;
    dateLabel: string;
    nextStateName: Path<T>;
    /** The state the bike is in now — bounds the offered transitions. */
    currentState: VehicleState;
    /** Drives the default next state; the operator can still override. */
    condition?: ReturnCondition;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

Reason, date and next-vehicle-state, in that order. It is shared between exchange and deboard because those two screens ask an identical question about the bike coming back, and the interesting logic — default the next state from the condition, then bound the choices by `VEHICLE_TRANSITIONS[currentState]` — should not be written twice and drift.

Effect: when `condition` changes, set `nextStateName` to `CONDITION_DEFAULT_STATE[condition]` **only if the operator has not already touched the field**. Track that with a local `touched` flag — clobbering a deliberate override is worse than a wrong default.

- [ ] **Step 2: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/src/pages/assignments/_components/DispositionFields.tsx
git commit -m "feat(assignments): add shared disposition fields for exchange and deboard"
```

---

### Task 18: Rebuild Exchange Vehicle — ABHIRAM

**Files:**
- Modify: `frontend/app/src/pages/assignments/ExchangeVehicle.tsx`
- Modify: `frontend/app/src/lib/schemas/assignment.ts` (SMK reviews)

**Interfaces:**
- Consumes: `RecordSearchSelect` (Task 3), `SelectionSummary`, `InfoStrip` (Task 4), `DispositionFields` (Task 17), `VehiclePicker`.

- [ ] **Step 1: Swap the rider picker for `RecordSearchSelect`**

Map each active rider to `{ id: r.id, primary: r.name, secondary: r.phone, trailing: r.currentVehicleId ?? '—' }`. The prototype searches rider id, name, mobile **and current vehicle id** — pass a `q` to `listRiders` so the server side of the search matches what the placeholder promises, rather than filtering the page client-side and quietly missing riders past the first page.

- [ ] **Step 2: Add `SelectionSummary`**

On a pick: current vehicle, its state, the rider's plan, days on the current bike. Before a pick, the prototype's own prompt — "Search and select an active rider".

- [ ] **Step 3: Add `DispositionFields` and the new request fields**

Reason from the widened `ExchangeReason`, exchange date, old-vehicle next state. Extend the Zod schema for `nextVehicleState` and the new reasons. Keep the `InfoStrip` stating that recovery is deliberately not an option in this flow — that is the prototype's line and it is a scope decision worth leaving on the screen.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/assignments/exchange`: searching a rider by their current vehicle id finds them; the summary fills; the replacement picker excludes the bike being handed back; the next-state select offers only legal transitions and defaults from the condition; confirming shows the new bike on the rider's row in `/riders`.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/pages/assignments/ExchangeVehicle.tsx frontend/app/src/lib/schemas/assignment.ts
git commit -m "feat(assignments): rebuild exchange with record search and explicit next state"
```

---

### Task 19: Rebuild Deboard Rider — ABHIRAM

**Files:**
- Modify: `frontend/app/src/pages/assignments/DeboardRider.tsx`
- Modify: `frontend/app/src/lib/schemas/assignment.ts` (SMK reviews)

**Interfaces:**
- Consumes: `RecordSearchSelect`, `SelectionSummary`, `InfoStrip`, `DispositionFields`, `DerivedField`, `DEBOARD_REASON_LABEL`.

- [ ] **Step 1: Rebuild the screen**

Rider via `RecordSearchSelect`; `SelectionSummary` showing the bike, outstanding rent and deposit held; `DispositionFields` with the nine `DeboardReason` options; then outstanding rent, deposit refund, and a `DerivedField` for the net — `deposit held − outstanding rent` — with its derivation shown, because that number is the one argued about at the counter.

- [ ] **Step 2: Extend the Zod schema**

`reason` and `nextVehicleState` required. Refuse a negative refund; a deduction larger than the deposit is an amount owed, not a negative refund, and we have not been told how that is recorded — so validate it out and say so in the message.

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Manual check**

`/assignments/deboard`: all nine reasons offered; the next-state select is separate from the reason and defaults from the condition; the net refund updates as amounts are typed; confirming makes the rider Inactive on `/riders` and frees the bike into the state chosen.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/pages/assignments/DeboardRider.tsx frontend/app/src/lib/schemas/assignment.ts
git commit -m "feat(assignments): rebuild deboard with the nine reasons and a net refund"
```

---

### Task 20: Today's Operations view

**Files:**
- Create: `frontend/app/src/pages/operations/TodayOperations.tsx`
- Modify: `frontend/app/src/types/dashboard.ts`
- Modify: `frontend/app/src/lib/api/dashboard.ts`
- Modify: `frontend/app/src/mocks/dashboard.ts`
- Modify: `frontend/app/src/app/nav.ts`, `frontend/app/src/app/router.tsx`

**Interfaces:**
- Consumes: `PeriodToggle`, `resolvePeriod` (Task 9), `StatTiles`, `PageHeader`, `Panel`.
- Produces:
  ```ts
  export interface OperationsPeriodSummary {
    movement: { deployed: number; exchanged: number; returned: number; recovered: number };
    outcome: { readyToDeploy: number; underRepair: number; qcPending: number; accident: number };
    source: { rsa: number; walkIn: number; qrt: number };
  }
  export function getOperationsSummary(startIso: string, endIso: string): Promise<OperationsPeriodSummary>;
  ```

- [ ] **Step 1: Add the type, the mock and the endpoint**

The fixture must vary with the range — a summary that returns the same numbers for a day and a month is not a period view and will be believed by someone in a demo. Seed a per-day table and sum across the requested range.

- [ ] **Step 2: Build the screen**

`PeriodToggle` in a `Panel`, showing the resolved label. Then three `StatTiles` strips under `Panel` labels "Vehicle movement", "Vehicle outcome" and "Service source", each tile's `to` carrying the range as query params so the drill-through lands on a list filtered to the same period.

- [ ] **Step 3: Add the route and nav item**

New `Operations` nav section above `Fleet`, `{ label: "Today's operations", path: '/operations/today', icon: TodayIcon, owner: 'smk', artboard: 21 }`.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/operations/today`: Day shows one date; Week shows a Wednesday→Tuesday span; Month shows the month name; the figures change between the three, and a tile opens a list carrying the same range.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/pages/operations/ frontend/app/src/types/dashboard.ts frontend/app/src/lib/api/dashboard.ts frontend/app/src/mocks/dashboard.ts frontend/app/src/app/nav.ts frontend/app/src/app/router.tsx
git commit -m "feat(operations): add the Today's Operations period view"
```

---

### Task 21: Service Management view

**Files:**
- Create: `frontend/app/src/pages/service/ServiceManagement.tsx`
- Modify: `frontend/app/src/types/dashboard.ts`, `frontend/app/src/lib/api/dashboard.ts`, `frontend/app/src/mocks/dashboard.ts`
- Modify: `frontend/app/src/app/nav.ts`, `frontend/app/src/app/router.tsx`

**Interfaces:**
- Consumes: `QueueBox` (Task 8).
- Produces:
  ```ts
  export interface ServiceQueueCounts {
    underRepair: { minor: number; major: number; accident: number; warranty: number; insurance: number; partsWaiting: number; qcPending: number };
    inService: { walkIn: number; rsa: number; qrt: number };
  }
  export function getServiceQueues(): Promise<ServiceQueueCounts>;
  ```

- [ ] **Step 1: Add the type, mock and endpoint**

Ten counts in two groups, exactly the prototype's split.

- [ ] **Step 2: Build the screen**

Two `QueueBox`es side by side — "Under repair" (7 rows) and "In service" (3 rows) — each row's `to` pointing at `/vehicles` with the filter that produces it. Where no such filter exists yet, point at `/vehicles?state=UNDER_REPAIR` and add an `InfoStrip` naming the queues that are not yet separately filterable. Do not invent a query parameter the vehicles list does not honour: a chip that silently ignores its filter is worse than one that says it cannot yet.

- [ ] **Step 3: Add the route and nav item**

`{ label: 'Service queues', path: '/service', icon: BuildIcon, owner: 'smk', artboard: 22 }` in `Fleet`.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/service`: ten rows with counts across two boxes; every row navigates; no row leads to a list contradicting its own count without the note explaining why.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/pages/service/ frontend/app/src/types/dashboard.ts frontend/app/src/lib/api/dashboard.ts frontend/app/src/mocks/dashboard.ts frontend/app/src/app/nav.ts frontend/app/src/app/router.tsx
git commit -m "feat(service): add the service queues view"
```

---

### Task 22: Recovery Summary view

**Files:**
- Create: `frontend/app/src/pages/recovery/RecoverySummary.tsx`
- Modify: `frontend/app/src/types/dashboard.ts`, `frontend/app/src/lib/api/dashboard.ts`, `frontend/app/src/mocks/dashboard.ts`
- Modify: `frontend/app/src/app/nav.ts`, `frontend/app/src/app/router.tsx`

**Interfaces:**
- Consumes: `QueueBox` (Task 8), `RECOVERY` state (Task 10).
- Produces:
  ```ts
  export interface RecoveryCounts {
    needToRecover: { partiallyPaid: number; notPaid: number; leftAtRoadside: number; missing: number; accident: number };
    recovered: { recovered: number };
  }
  export function getRecoveryCounts(): Promise<RecoveryCounts>;
  ```

- [ ] **Step 1: Add the type, mock and endpoint**

- [ ] **Step 2: Build the screen**

Two `QueueBox`es — "Need to recover" (5 rows) and "Recovered" (1). The first three rows are payment-driven and lead to `/payments/overdue`; the last three are vehicle-state-driven and lead to `/vehicles?state=RECOVERY`. Note in an `InfoStrip` that "vehicle missing" has no state of its own yet and is counted under recovery — an honest gap beats a fabricated state.

- [ ] **Step 3: Add the route and nav item**

`{ label: 'Recovery', path: '/recovery', icon: WarningIcon, owner: 'smk', artboard: 23 }` in `Money`.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/pages/recovery/ frontend/app/src/types/dashboard.ts frontend/app/src/lib/api/dashboard.ts frontend/app/src/mocks/dashboard.ts frontend/app/src/app/nav.ts frontend/app/src/app/router.tsx
git commit -m "feat(recovery): add the recovery summary view"
```

---

### Task 23: Inventory Management view

**Files:**
- Create: `frontend/app/src/types/inventory.ts`
- Create: `frontend/app/src/mocks/inventory.ts`
- Create: `frontend/app/src/lib/api/inventory.ts`
- Create: `frontend/app/src/pages/inventory/InventoryManagement.tsx`
- Modify: `frontend/app/src/lib/labels.ts`
- Modify: `frontend/app/src/app/nav.ts`, `frontend/app/src/app/router.tsx`

**Interfaces:**
- Consumes: `NumberedList` (Task 8), `DataTable`, `StateChip`, `InfoStrip`.
- Produces:
  ```ts
  export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  export interface InventoryItem {
    id: string; partName: string; partNumber: string; category: string;
    available: number; required: number; status: StockStatus;
  }
  export interface PartUsageRow { partName: string; queue: string; category: string; vehicleId: string | null; ticketId: string | null }
  export function listInventory(req?: PageRequest): Promise<Page<InventoryItem>>;
  export function listPartUsage(): Promise<PartUsageRow[]>;
  export const STOCK_STATUS_LABEL: Record<StockStatus, string>;
  export const STOCK_STATUS_TONE: Record<StockStatus, StatusTone>;
  ```

- [ ] **Step 1: Add the types, fixtures and endpoints**

`status` is derived from `available` vs `required` in the fixture, not stored twice — a fixture that can say `available: 40` and `OUT_OF_STOCK` in the same row will eventually say exactly that.

`STOCK_STATUS_TONE`: `IN_STOCK: 'good'`, `LOW_STOCK: 'caution'`, `OUT_OF_STOCK: 'bad'`. No new component — `StateChip` draws all three, and the tokens comment forbids a second way to draw a status.

- [ ] **Step 2: Build the screen**

`DataTable` of parts (name, number, category, available, required, status chip), the three prototype actions as buttons that route to nothing yet and say so in an `InfoStrip`, and a `NumberedList` for part usage carrying the prototype's stated ambition verbatim: **Part → Usage → Vehicle → Service ticket / Job card**.

- [ ] **Step 3: Add the route and nav item**

New `Inventory` nav section, `{ label: 'Parts & stock', path: '/inventory', icon: InventoryIcon, owner: 'smk', artboard: 24 }`.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/inventory`: parts table with all three stock tones present; the three action buttons state that they are not built; the usage list renders.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/types/inventory.ts frontend/app/src/mocks/inventory.ts frontend/app/src/lib/api/inventory.ts frontend/app/src/pages/inventory/ frontend/app/src/lib/labels.ts frontend/app/src/app/nav.ts frontend/app/src/app/router.tsx
git commit -m "feat(inventory): add the parts and stock view"
```

---

### Task 24: Bring the vehicle and rider masters up to the prototype

**Files:**
- Modify: `frontend/app/src/pages/vehicles/VehiclesList.tsx`
- Modify: `frontend/app/src/pages/vehicles/VehicleDetail.tsx`
- Modify: `frontend/app/src/lib/api/vehicles.ts`

**Interfaces:**
- Consumes: Task 10's fields; `BATTERY_VENDORS`, `VEHICLE_MAKES`.

- [ ] **Step 1: Add the two filters the prototype has and we lack**

Battery vendor and vehicle make, alongside the existing state facets. Extend `listVehicles` to honour both.

- [ ] **Step 2: Widen the search**

The prototype searches "Vehicle ID, Chassis, IoT, Controller, Motor or Rider ID". Match that in the mock's filter and in the placeholder — a placeholder promising IoT search over a filter that ignores it is a lie the hubs will find within a day.

- [ ] **Step 3: Show IoT number on the detail page**

Add it to the spec `DefinitionList`.

- [ ] **Step 4: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual check**

`/vehicles`: filtering by vendor and by make both narrow the table; pasting a known IoT number finds its bike; `/vehicles/:id` shows the IoT number.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/src/pages/vehicles/VehiclesList.tsx frontend/app/src/pages/vehicles/VehicleDetail.tsx frontend/app/src/lib/api/vehicles.ts
git commit -m "feat(vehicles): filter by vendor and make, search IoT and component numbers"
```

---

### Task 25: Align the dashboard tiles with the prototype

**Files:**
- Modify: `frontend/app/src/pages/Dashboard.tsx`
- Modify: `frontend/app/src/types/dashboard.ts`, `frontend/app/src/lib/api/dashboard.ts`, `frontend/app/src/mocks/dashboard.ts`

- [ ] **Step 1: Add the two missing counts**

`FleetSummary` gains `recoveryCases: number` and `lowStockItems: number` — the prototype's six-tile dashboard has both, and both now have views to lead to.

- [ ] **Step 2: Point every tile at its new home**

Service alerts → `/service`. Recovery cases → `/recovery`. Low stock → `/inventory`. The `StatTile.to` comment already states the rule: a tile counts a set, so it opens that set.

- [ ] **Step 3: Verify it compiles and lints**

```bash
cd frontend/app && npm run build && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Manual check**

`/dashboard`: every tile navigates, and each lands on a screen whose own count agrees with the tile.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/src/pages/Dashboard.tsx frontend/app/src/types/dashboard.ts frontend/app/src/lib/api/dashboard.ts frontend/app/src/mocks/dashboard.ts
git commit -m "feat(dashboard): add recovery and low-stock tiles, wire every tile to its view"
```

---

### Task 26: Update the Phase 1 plan

**Files:**
- Modify: `docs/PHASE1_UI_PLAN.md`

- [ ] **Step 1: Record what changed**

Add artboards 20–24 to the built table with their routes and owners. Extend the shared component list with the twelve new primitives. Add the contract-decisions table from this plan, so the reasoning does not live only in a plan file that gets archived.

- [ ] **Step 2: Write down the open question for Ashok**

One short section: the payment-day conflict, what we captured, what we refused to derive, and what we need him to say. This is the only unresolved conflict in the whole plan and it should be findable without reading the git log.

- [ ] **Step 3: Commit**

```bash
git add docs/PHASE1_UI_PLAN.md
git commit -m "docs: record artboards 20-24, the new component set and the contract decisions"
```

---

## Dependency order

```
SMK:      1 → 2 → 3 → 4 → 5 ─┬─→ 6 → 7 → 12
                              ├─→ 8 → 21, 22, 23
                              ├─→ 9 → 20
                              └─→ 10 → 11 → 13, 24 → 25 → 26

Abhiram:  (after 1, 2, 4, 5, 11 merge)  14 → 15 → 16
                                        17 → 18 → 19
```

Tasks 1–5, 10 and 11 are the critical path — they are the whole of Abhiram's dependency surface. Ship those seven first and the two of you run in parallel from then on.

## Self-review

**Spec coverage.** Every prototype view has a task: dashboard (25), Today's Operations (20), rider history (24 for the master, 16 for onboarding), vehicle management (24), service (21), payments (untouched — placeholder stays, `PeriodToggle` from Task 9 is ready for it), recovery (22), inventory (23). Every modal has a task: add rider (16), add vehicle (12), exchange (18), make inactive (19), scrap (13), vehicle/rider list (24), vehicle detail (24). Every one of the 13 components has its own task.

**Deliberately not covered.** Screen 16 (payment detail and receipt) and the weekly payment run itself — still unassigned in `PHASE1_UI_PLAN.md`, and the payment-day conflict is unresolved, so building the run now would bake in a guess. The prototype's stock adjustment and transfer forms are buttons with notes in Task 23, not screens: the prototype only names them, and there is nothing to build from.

**One open question, not resolved here.** Whether the per-rider payment day or the fixed Wednesday→Tuesday period governs billing. Captured and displayed either way; Task 26 writes it down for Ashok.
