# S6 (second half) — The weekly payment run, overdue, and receipts

**Stage:** S6, second half. **Owner:** SMK. **Branch:** `feat/s6-charges`.
**Status:** design approved in conversation 2026-09-28; not yet implemented.

**Unblocked by:** S2 (riders) landed 2026-09-28 in `bd0c79e`. The run needs a
rider's name, phone, weekly rent, billing day and deposit — all four now exist.

**Depends on, and ships without:** S5 (assignments), Abhiram's, not built.
See [The S5 seam](#the-s5-seam).

**Contract:** `frontend/app/src/types/payment.ts` is the authority on every wire
shape here. `frontend/app/src/mocks/payments.ts` is the authority on behaviour.
Where this document and those files disagree, they win and this is a bug.

---

## What this stage owns

The first half of S6 built the charge ledger: a service job closing against a
rider raises a `rider_charges` row. That is money *owed* but never money
*billed* — nothing gathers it into a week, nothing collects against it, and
nothing prints proof that it was paid.

This half builds those three:

| Screen | What it needs |
|---|---|
| Payment run (15) | Every rider on a billing cycle, one row, with the week's arithmetic shown |
| Payment receipt (16) | One rider's line, plus what was collected, how, and when |
| Overdue riders (17) | Who is behind, by how long, and what stage of chasing they are at |

Riders carry `billing_day` — `MONDAY` or `WEDNESDAY` — so there are two cycles
and a run is *the riders in that cycle, one row each, no more and no fewer*.

**Out of scope, deliberately:**

- **The dunning actions.** `OverdueRider.stage` is computed and returned. Actually
  sending a reminder, escalating, or marking a repossession needs the
  notification module, which is not built. The screen's CTAs stay mock.
- **The Recovery board.** It sits in the Money section of `RBAC.md` but is a
  different workflow from billing, and was not in this stage's line in
  `BUILD.md`.

---

## The decision that shapes everything: freeze, don't derive

The mock derives all three screens — the run from the riders, the receipt from
the run, the overdue list from the riders. It says why, and for a fixture it is
right:

> the run is the single source of the numbers, so a receipt cannot drift from
> the run it came out of

For real money it has a property that is not acceptable. Nothing is stored, so
everything is recomputed on read. Raise a rider's weekly plan from ₹1,750 to
₹1,900 and **a receipt printed six weeks ago silently becomes ₹1,900**. Same for
a settled charge, or a rider moved from Monday to Wednesday billing.

So a period is **frozen when the run is generated**. `payment_periods` holds one
row per rider per period, snapshotting the whole calculation at generation time.

The split that makes this work, and the one sentence to remember:

> **The snapshot freezes what is owed. Collections record what came in.
> `status` is a function of the two.**

A plan change never rewrites an old week. Money landing today still flips last
week's row to `PAID`. Both, at once, because they are different columns.

---

## Schema — `V009__payment_periods.sql`

### `rider_charges` learns its period

`RiderCharge.periodStart` is in the frontend type — *"the billing period this
charge should first appear against"* — and it is what separates the two money
columns on a run row. `serviceCharges` are charges landing **in** this period;
`arrears` are OPEN charges from **before** it. V007 has no such column, only
`charged_on`.

```sql
ALTER TABLE rider_charges ADD COLUMN period_start DATE;

-- README rule 2: without the bypass this UPDATE reports 0 rows and the
-- migration carries on as though it worked. V005 already made this mistake.
SELECT set_config('app.tenant_id', '*', true);

UPDATE rider_charges rc
   SET period_start = rc.charged_on::date
       - ((EXTRACT(ISODOW FROM rc.charged_on)::int
           - CASE r.billing_day WHEN 'MONDAY' THEN 1 ELSE 3 END + 7) % 7)
  FROM riders r
 WHERE r.id = rc.rider_id;

ALTER TABLE rider_charges ALTER COLUMN period_start SET NOT NULL;
```

The backfill snaps each charge to the most recent billing day on or before
`charged_on`. Stamped once at charge time thereafter — a fact recorded, not
re-derived, so moving a rider between cycles cannot re-bucket their history.

### `payment_periods`

```sql
CREATE TABLE payment_periods (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants (id),
  rider_id              UUID NOT NULL REFERENCES riders (id),

  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  billing_day           VARCHAR(10) NOT NULL,

  -- Null until S5. A run row still bills the plan; it just cannot name a bike.
  vehicle_id            UUID REFERENCES vehicles (id),

  -- The frozen calculation.
  plan_amount_paise     BIGINT NOT NULL,
  days_billed           INT    NOT NULL,
  per_day_amount_paise  BIGINT NOT NULL,
  billed_amount_paise   BIGINT NOT NULL,
  service_charges_paise BIGINT NOT NULL DEFAULT 0,
  arrears_paise         BIGINT NOT NULL DEFAULT 0,
  total_due_paise       BIGINT NOT NULL,

  -- The mutable half: maintained from payment_collections.
  amount_paid_paise     BIGINT NOT NULL DEFAULT 0,
  status                VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  receipt_no            VARCHAR(40),

  generated_on          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_pp_status CHECK (status IN ('PENDING','PARTIAL','PAID','OVERDUE')),
  CONSTRAINT chk_pp_billing_day CHECK (billing_day IN ('MONDAY','WEDNESDAY')),
  CONSTRAINT chk_pp_days CHECK (days_billed BETWEEN 0 AND 7),
  CONSTRAINT chk_pp_money CHECK (
    plan_amount_paise >= 0 AND billed_amount_paise >= 0
    AND service_charges_paise >= 0 AND arrears_paise >= 0
    AND total_due_paise >= 0 AND amount_paid_paise >= 0),
  CONSTRAINT chk_pp_window CHECK (period_end > period_start)
);

-- Natural key AND the idempotency guard for lazy generation. Both jobs, one index.
CREATE UNIQUE INDEX idx_pp_rider_period ON payment_periods (tenant_id, rider_id, period_start);
-- The run screen: every rider in one cycle for one week.
CREATE INDEX idx_pp_run ON payment_periods (tenant_id, period_start, billing_day);
-- The overdue list.
CREATE INDEX idx_pp_status ON payment_periods (tenant_id, status, period_end);

SELECT enable_tenant_rls('payment_periods');
```

`receipt_no` is deliberately nullable: the contract says it is *"only meaningful
once something has been paid"*.

### `payment_collections`

```sql
CREATE TABLE payment_collections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id),
  period_id            UUID NOT NULL REFERENCES payment_periods (id),
  amount_paise         BIGINT NOT NULL,
  method               VARCHAR(20) NOT NULL,
  reference            VARCHAR(100),
  collected_on         TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_by_user_id UUID REFERENCES users (id),

  CONSTRAINT chk_pc_amount CHECK (amount_paise > 0),
  CONSTRAINT chk_pc_method CHECK (method IN ('UPI','CASH','BANK_TRANSFER'))
);

CREATE INDEX idx_pc_period ON payment_collections (tenant_id, period_id, collected_on);

SELECT enable_tenant_rls('payment_collections');
```

One row per payment received, never an overwrite. Two partial payments in a week
is a real case — `PARTIAL` is in the status enum and riders pay cash in pieces —
and a mistyped amount is corrected by a reversing entry, not by editing money in
place.

### `receipt_counters`

```sql
CREATE TABLE receipt_counters (
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  year      INT  NOT NULL,
  next_no   BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, year)
);

SELECT enable_tenant_rls('receipt_counters');
```

Bumped with `UPDATE … RETURNING` inside the collection's transaction. A row lock
rather than a Postgres sequence, because a sequence leaves gaps when a
transaction rolls back and a receipt book with holes in it is a question nobody
wants to answer during an audit.

### A note on the foreign keys

These are new tables with no legacy rows, so their FKs go on **validated**, not
`NOT VALID`. That is the opposite of what V008 had to do, and the difference is
only that V008 was adding constraints to tables that already held data.

Rule 3 of `db/migration/README.md` still applies to how they are added: an
`ADD CONSTRAINT` under `FORCE ROW LEVEL SECURITY` validates against an
RLS-filtered view. Inline `REFERENCES` in `CREATE TABLE` on an empty table is
safe. Any FK added by a later `ALTER` is not, and must follow the README.

---

## The S5 seam

A run row needs two facts that only an assignment has:

- `vehicleId` — which bike the rider holds
- `daysBilled` — *"Days actually billed in the period — a mid-week deboard bills fewer"*

`assignment/` holds nothing but a `package-info.java`. S2 deliberately did not
put `currentVehicleId` on the rider, because a rider's bike is a property of the
open assignment. The mock papers over this with `r.currentVehicleId` and uses
`onboardedOn` as a stand-in, and says so.

So `payment/` declares what it needs and ships a no-op:

```java
package com.evrental.payment;

/**
 * What the payment run needs to know about a rider's bike. Implemented by S5.
 *
 * <p>This interface lives in payment/ rather than assignment/ on purpose.
 * assignment/ is Abhiram's module, and WORK_SPLIT.md says reaching into
 * another person's file is a conversation, not an edit. So the consumer
 * declares its own need and the owner satisfies it when the stage arrives.
 */
public interface AssignmentQuery {

    Optional<Window> openAssignmentFor(UUID riderId, LocalDate from, LocalDate to);

    record Window(UUID vehicleId, String registryId, LocalDate startedOn, LocalDate endedOn) {}
}
```

`NoAssignmentsYet implements AssignmentQuery` returns `Optional.empty()` and
ships in `payment/`. When S5 lands, Abhiram's implementation in `assignment/`
takes over as the primary bean.

**This is the second cross-module contract**, alongside `ServiceJobFacade.openJob()`,
and the direction is reversed: there SMK publishes and Abhiram calls; here SMK
declares and Abhiram implements. `WORK_SPLIT.md`'s table of the three places the
two of you meet needs a fourth row, **and the shape above needs Abhiram's
agreement before it is real.**

Until then: `vehicleId` is null and `daysBilled` is 7.

---

## Generation

`GET` the current run for a billing day. For each ACTIVE rider on that cycle with
no row for the period yet:

```
window          = assignmentQuery.openAssignmentFor(rider, start, end)   // empty until S5
vehicleId       = window?.vehicleId                                      // null until S5
daysBilled      = overlap(window, period) clamped 0..7                   // 7 until S5
perDay          = round(planAmount / 7)
billed          = daysBilled == 7 ? planAmount : perDay * daysBilled
serviceCharges  = Σ OPEN RIDER charges WHERE period_start  = this period
arrears         = Σ OPEN RIDER charges WHERE period_start  < this period
totalDue        = billed + serviceCharges + arrears
amountPaid      = 0
status          = PENDING
```

Inserted `ON CONFLICT DO NOTHING` against `idx_pp_rider_period`, then read back.
Two people opening the screen at the same moment cannot double-generate.

Generation happens on read. There is no scheduler: the API runs on Render's
**free** plan and spins down after roughly 15 minutes idle, so a job firing at
00:00 Monday would land on a sleeping service and quietly not run. Confirmed by
observation on 2026-09-28 — a health check timed out at 90s and a browser login
sat for about a minute while the service woke. If the service is ever moved to
Starter, a scheduler becomes an option; it is not one today.

### Three rules that are easy to get wrong

**A full week bills the plan exactly.** `round(199900/7) × 7` is ₹1,999.05, not
₹1,999. The mock carries this drift; the designed rows on artboard 15 do not. So
`daysBilled == 7` bills `planAmount` and proration applies only below seven days.
Otherwise every rider is quietly overcharged four paise a week, forever.

**`DEPOSIT` charges never reach a run.** They are settled against the deposit, not
billed. Only `liability = 'RIDER'` is gathered. Straight from the contract:
*"a DEPOSIT charge never appears on the run"*.

**A rider with no plan has nothing to bill.** `daysBilled = 0` produces a row with
`billed = 0`, not a missing row. The rider still appears on the run, because a
run that silently omits people is how someone stops being billed by accident.

### `status`

Computed, never frozen:

```
amountPaid >= totalDue            → PAID
amountPaid >  0                   → PARTIAL
today > periodEnd && still short  → OVERDUE
otherwise                         → PENDING
```

---

## API

```
GET  /api/v1/payments/runs/current?billingDay=MONDAY   → PaymentRun        SA/FA
GET  /api/v1/payments/overdue                          → OverdueRider[]    SA/FA
GET  /api/v1/payments/receipts/{riderId}               → PaymentReceipt?   SA/FA
POST /api/v1/payments/collections                      → PaymentPeriodRow  SA/FA
```

These mirror `lib/api/payments.ts` one for one — `getCurrentPaymentRun`,
`listOverdueRiders`, `getPaymentReceipt`, `recordPayment` — so the frontend swap
is a re-export, not a rewrite.

Neither the run nor the receipt takes a `periodStart`: the contract's functions
do not have one, so both mean **current**, resolved server-side as *the most
recent occurrence of the rider's billing day on or before today*. Older periods
are reachable through the history panel that already exists.

`recordPayment` returns the updated `PaymentPeriodRow` so `RecordPaymentDialog`
can close onto fresh numbers without a refetch.

### One existing endpoint becomes real

`RiderPaymentController.periods()` returns `List.of()` today — the seam Abhiram
built for S2 so screen 08 had something to call. S6 makes it return the rider's
actual `payment_periods` rows as `RiderPaymentRow`. It stays **SA/FA/FS**, not
SA/FA: it lives on the rider profile, which is a Riders-section page, and FS-12
says fleet staff see a rider's payment history. The ledger itself stays SA/FA.
That file is in `payment/`, SMK's module, so no ownership conversation.

### Roles

Money is **SA/FA only** — `RBAC.md` §Money: *"FS and SM never see the section"*.
The one exception is the rider history panel above.

---

## Error handling

| Case | Response |
|---|---|
| Unknown rider | 404 |
| Rider exists, no line in this period | 200 with `null` body — the screen renders "no line in this period" |
| `amount <= 0` | 422 naming `amount` |
| Payment against a rider with no current line | 409 naming the rider |
| Unknown `method` | 422 naming `method` |
| Overpayment | **Allowed** |

Overpayment is allowed on purpose. `PaymentReceipt.balance` is documented as
*"totalDue − amountPaid; positive means still owed"*, which already anticipates a
negative. Riders pay ahead, and refusing the money at the counter is worse than
carrying a credit.

`amount_paid_paise` is recomputed as `SUM(payment_collections)` inside the
collection's transaction — never `amount_paid + ?`. Two people recording cash at
the same counter cannot lose one.

Errors leave through the existing `NotFoundException` / `ConflictException` /
`ValidationException`. Nothing builds an error by hand.

---

## Known compromises

1. **`vehicleId` is null and `daysBilled` is 7 until S5.** Every run row is a full
   week against a bike the system cannot name. The arithmetic is right; the
   attribution is incomplete. This is the honest version of the mock's
   `onboardedOn` guess.
2. **No scheduler.** Generation is a side effect of a GET. This is a deliberate
   trade against unreliable infrastructure, not an oversight, but it does mean a
   period that nobody opens does not exist.
3. **Dunning stages are computed, not tracked.** `stage` is a pure function of
   `daysOverdue`. Nothing records that a reminder was actually sent, because
   nothing can send one yet.
4. **`daysOverdue` counts from `period_end`** — the day that week's money was due.
   The thresholds are the mock's `stageFor`: 7 → `WARNING_1`, 14 → `WARNING_2`,
   21 → `REPOSSESSION_DUE`, below 7 → `REMINDER_DUE`.

---

## Frontend change

None required by this stage. `lib/api/payments.ts` keeps its four functions and
its mock implementations; the swap to `payments.live.ts` / `payments.mock.ts`
follows the `vehicles.ts` pattern and is a separate piece of work, gated on S5
for `vehicleId` to be meaningful.

---

## Tests

Real Postgres 16 through Testcontainers, following the existing `*TestBase`
pattern. A `PaymentRunTestBase` seeds two tenants, riders on both cycles, and a
charge ledger.

**Generation**

- two concurrent GETs for the same period produce one set of rows
- a full week bills `planAmount` exactly — the ₹1,999 rounding case
- fewer than seven days prorates at `perDay × daysBilled`
- a rider with no plan gets a zero row, not a missing row
- riders on the other billing day are not in this run

**The money split**

- `serviceCharges` picks up only charges whose `period_start` equals the period
- `arrears` picks up only OPEN charges from earlier periods
- a `DEPOSIT` charge appears in neither
- a SETTLED charge appears in neither

**Collections and status**

- `PENDING → PARTIAL → PAID` as money arrives
- a period past `period_end` and still short reads `OVERDUE`
- two concurrent collections both land and `amount_paid` equals their sum
- overpayment is accepted and `balance` goes negative
- `receipt_no` is assigned on the first collection and does not change on the second

**The invariant the whole design exists to protect**

- a receipt's `totalDue`, `billedAmount`, `serviceCharges` and `arrears` are
  identical to its run row's, always
- changing a rider's `plan_amount` after generation does not move a single
  number on an existing period

**Access**

- FS and SM get 403 on all four endpoints
- FS gets 200 on the rider history panel
- another tenant's period is invisible, and its id 404s rather than leaking

---

## Open questions for Ashok

1. **Does a rider who hands the bike back mid-week still owe the rest of the week?**
   This design prorates — `daysBilled` falls and the bill falls with it. The
   alternative is that the week is owed in full once started. It changes the
   deboard conversation, not the schema.
2. **Should an overdue rider keep accruing new weekly periods?** Today they do: a
   rider three weeks behind gets a fourth row. The alternative is to stop billing
   at some dunning stage, which makes `arrears` the only growing number.

---

## What the implementation changed (written after the build, 2026-09-28)

The design stood up almost exactly as written. Six things moved, and each one
moved for a reason worth keeping on the record.

1. **`V009`'s backfill needed a second pass.** The `UPDATE … FROM riders`
   clause in this document only reaches charges whose `rider_id` matches a row
   on the register. `V008` deliberately left the pre-S2 orphans alone — it
   added `fk_rider_charges_rider` as `NOT VALID` for exactly that reason — so
   those charges would have kept `period_start IS NULL` and the following
   `SET NOT NULL` would have failed. A failed Flyway migration does not roll
   back and retry; it blocks every start-up after it. The migration now snaps
   orphans to the Monday on or before their `charged_on` before tightening the
   column.

2. **Billing happens in `Asia/Kolkata`, explicitly.** `charged_on` is
   `TIMESTAMPTZ` and both Flyway and Render run in UTC, so `EXTRACT(ISODOW …)`
   would have put a charge raised at 9pm IST into the next day — and, one week
   in seven, into the next billing period. The migration converts with
   `AT TIME ZONE 'Asia/Kolkata'` and `BillingClock` is the only thing in
   `payment/` allowed to ask what day it is.

3. **`OVERDUE` is tested before `PARTIAL`, not after.** This document lists the
   statuses in the other order. A week that closed with half the money in is a
   week somebody has to chase, so it has to reach the overdue list; if
   `PARTIAL` won, it never would. The design's own test list agrees — "closed
   and still short reads OVERDUE".

4. **`NoAssignmentsYet` is displaced by `@Primary`, not
   `@ConditionalOnMissingBean`.** That annotation is only dependable inside
   auto-configuration, which this is not. S5's implementation must carry
   `@Primary`.

5. **`vehicleId` on the wire is the registry id string** (`"BLRSS0428"`), not
   the row's UUID — that is what an operator reads off the bike and what the
   mock shows. It is null until S5 answers, which the TypeScript type does not
   currently admit.

6. **A receipt with no periods returns a literal `null` body.** Returning a
   Java `null` gives an empty body, and `res.json()` throws on an empty body.
   The controller writes `NullNode` so the client gets the `null` it expects.

One addition: `RecordPaymentRequest` carries an optional `reference` field
(the UPI transaction id) that the frontend type does not have yet. It is
stored on the collection and ignored on the way out, so adding it to the
frontend later is a display change, not a contract change.
