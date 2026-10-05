# EV Fleet App — Long-Form User Stories (Common-Sense / Black-Box)

> Written from what a normal user would expect the app to do, not from the
> existing codebase. Each story covers a full flow end-to-end, every state
> change involved, and valid + invalid data cases a QA engineer would check.

---

## Story 1 — Vehicle enters the fleet and becomes assignable

**As a fleet operator, I want to add a new EV to the system and get it ready
for a rider, so that it can start earning as soon as possible.**

**Flow & state changes:**
1. Add vehicle → state = `INDUCTED` (not assignable yet).
2. Run inspection → state moves to `READY_TO_DEPLOY` (if clean) or
   `UNDER_REPAIR` / `ACCIDENT` (if damaged).
3. If `UNDER_REPAIR` → repair completed → enters `QC_PENDING`.
4. QC passes → state = `READY_TO_DEPLOY`. QC fails → back to `UNDER_REPAIR`.
5. Vehicle assigned to a rider → state = `DEPLOYED`, linked to rider ID.

**Valid data checks:**
- Unique vehicle ID / registration number, correctly formatted chassis number.
- Purchase/induction date is today or in the past.
- All mandatory fields (make, model, battery type, hub) filled.
- Confirm vehicle only appears in "assignable" list once it's `READY_TO_DEPLOY`.

**Invalid data checks:**
- Duplicate vehicle ID / chassis number → should be rejected, not silently overwritten.
- Future-dated purchase date → should be rejected with a clear error.
- Empty mandatory fields → form should block submission, not save a partial record.
- Special characters/emoji in ID or registration number → rejected.
- Extremely long strings in text fields (notes, model) → should be truncated or rejected, not crash the form.
- Negative or zero odometer reading → rejected.
- Submitting the same form twice quickly (double-click) → should not create two duplicate vehicles.

**State-change verification:**
- A vehicle still `UNDER_REPAIR` must NOT be selectable in the "assign vehicle" screen.
- A `RETIRED` vehicle must never reappear in any active list (assign, exchange, QC).
- Confirm the lifecycle/history log records every transition with timestamp and actor — no state change should happen silently without a trace.

---

## Story 2 — Rider onboarding, KYC, and first vehicle assignment

**As an operations admin, I want to onboard a new rider with verified
documents and assign them a ready vehicle, so they can start working
immediately with no ambiguity about who has which bike.**

**Flow & state changes:**
1. Rider record created → status = `PENDING_KYC` or `ACTIVE` (unassigned).
2. KYC documents (Aadhaar, license, PAN) submitted → verified/rejected.
3. Vehicle assigned → rider status = `ACTIVE` + vehicle linked; vehicle state = `DEPLOYED`.
4. If assignment fails (e.g., vehicle already taken) → no state should change on either side.

**Valid data checks:**
- Aadhaar is exactly 12 digits, phone number is a valid 10-digit mobile number.
- Deposit and weekly rent are positive, sensible amounts (not ₹0 rent for a real contract).
- Onboarding date is not in the future.
- A rider can only be assigned a vehicle that is currently `READY_TO_DEPLOY` and unassigned.

**Invalid data checks:**
- Aadhaar with letters, less/more than 12 digits → rejected.
- Phone number starting with 0–5, or fewer/more than 10 digits → rejected.
- PAN/driving license in the wrong format (if entered) → rejected, but allowed to be left blank.
- Negative deposit, negative rent, or rent of an unrealistic magnitude (e.g., ₹10,00,000/week) → rejected or flagged.
- Assigning a vehicle that is already `DEPLOYED` to someone else → must be blocked with a clear error, not silently reassigned.
- Assigning a vehicle to a rider who already has an active vehicle → should be blocked (must exchange/deboard first).
- Onboarding with a duplicate Aadhaar/phone number → system should warn about a possible duplicate rider.

**State-change verification:**
- After a successful assignment: rider shows "1 active vehicle," vehicle shows "assigned rider name," and both states update atomically — if the vehicle update fails, the rider must not end up half-assigned.
- Attempting to assign twice in parallel (two admins, same vehicle) should result in only one success; the second attempt should fail cleanly, not corrupt data.

---

## Story 3 — Vehicle exchange mid-contract

**As a fleet staff member, I want to swap a rider's damaged or
problematic bike for another one without losing any history, so the rider
isn't stuck without transport and the damaged bike enters repair properly.**

**Flow & state changes:**
1. Rider currently has vehicle A (`DEPLOYED`).
2. Exchange initiated: reason selected (breakdown, accident, rider request, etc.), condition of returned bike recorded.
3. Vehicle A's assignment closes (end date recorded) → vehicle A moves to `QC_PENDING`, `UNDER_REPAIR`, or `ACCIDENT` based on damage reported.
4. Vehicle B is selected (must be `READY_TO_DEPLOY`) → new assignment opens → vehicle B becomes `DEPLOYED`, linked to the same rider.
5. Rider never has a gap recorded as "no vehicle" during the swap — it's a single atomic transaction.

**Valid data checks:**
- Exchange date is on/after the original assignment's start date.
- Replacement vehicle is different from the one being returned.
- If damage is reported, at least one damaged part/description is given.
- If no damage reported, the damage detail section must be empty (no contradictory data).

**Invalid data checks:**
- Selecting the same vehicle as both "returning" and "replacement" → rejected.
- Selecting a replacement vehicle that's `UNDER_REPAIR`, `ACCIDENT`, or already `DEPLOYED` elsewhere → rejected.
- Marking damage severity as "Major" but leaving the damage detail blank → rejected.
- Marking damage as "None" but still listing damaged parts → rejected (contradiction).
- Backdating the exchange before the rider's original assignment start date → rejected.
- Overriding the system-suggested next state (e.g., forcing a majorly damaged bike straight to "ready") without a justification note → should be blocked or require a mandatory reason.

**State-change verification:**
- Old vehicle's assignment history shows a closed record with an end date — it must not remain "open."
- New vehicle's assignment history shows a new open record with the correct start date.
- Rider's "current vehicle" field reflects only the new bike, never both or neither.
- Confirm no duplicate active assignment rows exist for the same rider at the same time.

---

## Story 4 — Rider deboarding / contract closure

**As an admin, I want to deboard a rider and settle their account —
collecting outstanding rent, refunding or deducting the deposit, and
releasing the bike — so the contract closes cleanly and the vehicle is free
for the next rider.**

**Flow & state changes:**
1. Rider has an active vehicle, status `ACTIVE`.
2. Deboard initiated: return condition recorded, reason selected, outstanding dues and deposit settlement entered.
3. Vehicle's assignment closes → vehicle moves to appropriate next state (`QC_PENDING`/`UNDER_REPAIR`/`ACCIDENT`/`READY_TO_DEPLOY`) depending on condition.
4. Rider status → `INACTIVE`/`OFFBOARDED`, no longer linked to any vehicle.
5. Final settlement recorded on rider's payment ledger (closing balance, deposit refunded/forfeited).

**Valid data checks:**
- Outstanding dues and deposit refund are both zero or positive numbers.
- Deposit refund does not exceed the original deposit amount paid.
- Return date is on/after the last assignment start date, and not in the future.

**Invalid data checks:**
- Negative outstanding dues or negative refund amount → rejected.
- Refund amount greater than the deposit originally collected → rejected or requires special approval flag.
- Deboarding a rider who has no currently assigned vehicle → should be blocked with "nothing to deboard," not silently succeed.
- Submitting the deboard twice (double submit / network retry) → must not double-charge or double-refund.
- Leaving the "reason" field blank → rejected, since every deboard must be explainable.

**State-change verification:**
- After deboarding, the rider cannot appear in "active riders with vehicle" lists.
- The vehicle must show up in whichever queue matches its reported condition (repair/QC/ready) — never stuck as still `DEPLOYED`.
- Rider's payment history should permanently keep the final settlement row, even after the rider is marked inactive (must not be deleted/lost).
- Re-onboarding the same rider later (new Aadhaar check) should not inherit the old vehicle assignment or an incorrect "active" flag.

---

## Story 5 — Weekly payment collection and overdue handling

**As a collections admin, I want to run the weekly billing cycle, record
payments as they come in, and track riders who fall behind, so revenue
collection is accurate and nobody slips through without follow-up.**

**Flow & state changes:**
1. Billing cycle runs → every active rider gets a period row with amount due, status = `PENDING`.
2. Rider pays in full → status = `PAID`.
3. Rider pays partially → status = `PARTIAL`, remaining balance carried as arrears.
4. Rider pays nothing past the due date → status = `OVERDUE`, enters dunning stages (reminder → warning → final warning → recovery).
5. Recovery action taken (bike recovered) → vehicle state changes to `RECOVERY`, rider flagged accordingly.

**Valid data checks:**
- Payment amount is positive and does not exceed what's reasonably outstanding (warn if drastically overpaid).
- Payment method is one of the supported options (UPI/cash/bank transfer).
- Payment date is not before the billing period start or after today.

**Invalid data checks:**
- Entering a negative or zero payment amount → rejected.
- Entering a payment amount far exceeding total due (e.g., paying ₹50,000 against a ₹1,750 due) → should warn/confirm, not silently accept as correct.
- Recording a payment against a rider/period that's already fully `PAID` → should be blocked or require override justification.
- Recording a payment with a future date → rejected.
- Sending "remind all" when there are zero overdue riders → should show a no-op message, not error out.
- Network failure mid-payment-submission → must not show "paid" on the UI if the backend didn't confirm it (no false positive success state).

**State-change verification:**
- A `PARTIAL` payment correctly reduces `totalDue`, and the remaining balance carries forward as arrears into the next period — it must not vanish or double-count.
- Once status flips to `PAID`, the rider should disappear from the overdue list immediately.
- Dunning stage must escalate only based on days overdue — manually sending a reminder should not reset or skip the stage incorrectly.
- Recovered vehicles must leave the "deployed" count and appear only in the recovery queue, not in both simultaneously.

---

## Story 6 — Workshop inspection and QC gate

**As a service manager, I want every returned or damaged bike to go
through inspection and a quality check before it's allowed back on the
road, so unsafe bikes never get redeployed.**

**Flow & state changes:**
1. Vehicle arrives in `RETURNED`, `UNDER_REPAIR`, or `ACCIDENT` state.
2. Inspection recorded with cost estimate and damage category → vehicle routed to `READY_TO_DEPLOY` (no damage) or stays in repair.
3. Repair completed → vehicle enters `QC_PENDING`.
4. QC check: Pass → `READY_TO_DEPLOY`. Fail → back to `UNDER_REPAIR` with a reason, repeating the cycle.

**Valid data checks:**
- Inspection cost items are all non-negative, and the total matches the sum of line items.
- QC fail reason is provided whenever a fail decision is made.
- Technician/inspector name is recorded for accountability.

**Invalid data checks:**
- Negative cost on any repair line item → rejected.
- Total cost field that doesn't match the sum of entered line items → rejected or auto-recalculated with a visible warning.
- Passing QC with no technician/inspector assigned → rejected.
- Failing QC without a reason → rejected.
- Attempting to pass QC on a vehicle that was never in `QC_PENDING` (e.g., still mid-repair) → blocked.
- Submitting an inspection on a `RETIRED` vehicle → blocked, since retired bikes shouldn't re-enter the workflow.

**State-change verification:**
- A failed QC bike must reappear in the "under repair" queue, not disappear or get stuck in limbo.
- A bike cannot skip from `ACCIDENT` straight to `DEPLOYED` without passing through repair and QC — this bypass must be explicitly blocked or require clear admin override with a logged reason.
- Every QC decision (pass/fail) must be timestamped and attributed to a specific user in the vehicle's history — an untraceable state change is treated as a bug.

---

## Cross-Cutting QA Checklist (applies to all 6 stories)

- **Idempotency:** Double-clicking any submit button, or retrying after a timeout, must never create duplicate records or duplicate state transitions.
- **Atomicity:** Any flow touching two entities (rider + vehicle, vehicle + payment) must update both or neither — no partial/half-updated state.
- **Authorization:** Each role should only see/do what their permissions allow (e.g., a service manager shouldn't be able to record a rider payment).
- **Audit trail:** Every state change (vehicle state, rider status, payment status) must be logged with who/when/what-changed and be visible later.
- **Boundary values:** Test the exact min/max limits of every numeric and text field (e.g., 0, 1, max-length, max-length+1, negative, decimal where only integers are expected).
- **Concurrency:** Two users acting on the same record at the same time should not corrupt data — last-write-wins or explicit conflict errors, never silent data loss.
- **Recovery from failure:** If a step fails partway (e.g., network drop after payment but before confirmation), the UI must not claim success, and retrying must be safe.

---

# Part II — Deeper Stories and Complex State Flows

> Same rule as Part I: written from what the business and a front-desk user
> would expect, not from what the code does today. Where a story asks for
> something the app does not have yet, that is a finding, not a mistake in
> the story. Codes in these stories are the friendly ones a user sees
> (`R01`, `J01`, `BLRSS0428`); a database id must never appear on a screen,
> in a URL, in an export or in an error message.

---

## Story 7 — Vehicle retirement and disposal

**As a fleet manager, I want to retire a bike that is written off, stolen or
sold, so that it stops appearing anywhere an operator could act on it, while
its whole history stays readable.**

**Flow & state changes:**
1. Retirement is requested with a reason (written off, stolen, sold, end of
   life) and a date → state = `RETIRED`. Terminal: nothing moves out of it.
2. If the bike is `DEPLOYED`, retirement is refused until the rider has been
   exchanged or deboarded — a rider must never be left holding a bike that
   does not exist.
3. If the bike has an open service job, retirement is refused until the job is
   closed (liability decided) or explicitly cancelled with a reason.
4. Retirement is recorded in the lifecycle log with actor, date and reason.

**Valid data checks:**
- Retirement date is today or in the past, and not before the induction date.
- Reason is mandatory; free text note optional, bounded in length.
- The bike is gone from: assign picker, exchange picker, inspection picker,
  QC queue, dashboard "active fleet" count. Present in: vehicle detail by
  direct URL (read-only), audit log, historical payment rows that name it.

**Invalid data checks:**
- Retiring a `DEPLOYED` bike → refused, message names the rider holding it.
- Retiring a bike with an open job → refused, message names the job code.
- Retiring twice → second attempt is a clear "already retired", not a crash
  and not a second log line.
- Editing a retired bike's model, hub or chassis → refused; history must not
  be rewritten.
- Opening a job, assigning, exchanging onto or inspecting a retired bike by
  direct API call → refused with the same message the screen would show.

**State-change verification:**
- Dashboard totals reconcile: total fleet = active + in workshop + retired.
- A retired bike's chassis number may not be reused by a new vehicle record
  (a stolen bike recovered is un-retired by an admin with a reason, not
  re-added).

---

## Story 8 — Accident mid-contract, insurance and liability

**As an operations lead, when a rider has an accident I want the bike, the
rider and the money to be handled together, so nothing falls between the
desks.**

**Flow & state changes:**
1. Rider reports the accident (phone / help desk). Operator opens a help-desk
   job on the bike with category `ACCIDENT` while the bike is still
   `DEPLOYED` → bike moves to `ACCIDENT`; rider still holds the contract.
2. Bike recovered to the hub; recovery noted on the job (location, who
   brought it, photos reference).
3. Decision: repairable or written off.
   - Repairable → job queue `INSURANCE` or `MAJOR_REPAIR`; claim number
     mandatory for insurance; parts and labour listed; → `QC_PENDING` →
     QC → `READY_TO_DEPLOY`.
   - Written off → retire (Story 7) after the rider is moved.
4. The rider needs to keep earning: an exchange onto a `READY_TO_DEPLOY`
   bike is done the same day (Story 3). The accident bike's job stays open
   and keeps the rider's name on it as the person liable, even though the
   rider no longer holds the bike.
5. Job closes with liability: `RIDER` (negligence), `DEPOSIT` (deducted),
   `COMPANY` or `INSURANCE`. Closing creates exactly one charge on the
   rider's ledger when liability is `RIDER` or `DEPOSIT`.

**Valid data checks:**
- An `ACCIDENT` job needs: date/time of incident (not in the future, not
  before the assignment began), location, a description, and whether the
  rider was hurt.
- Insurance queue needs a claim number before the job can move again.
- Rider liability amount ≤ repair total; deposit deduction ≤ deposit held.

**Invalid data checks:**
- Accident date before the rider got the bike → refused.
- Closing the job with liability `RIDER` and a zero cost → the charge is not
  created and the operator is told why (nothing to bill).
- Closing with liability `DEPOSIT` for more than the deposit held → refused
  or the remainder becomes a `RIDER` charge, explicitly, never silently
  dropped.
- `ACCIDENT` → `DEPLOYED` directly → refused; the bike must pass QC.
- Exchange that tries to hand the rider the same accident bike → refused.

**State-change verification:**
- After step 4 the rider's detail shows: current bike = replacement, past
  bike = accident bike with the job code linked.
- The accident bike's lifecycle: `DEPLOYED → ACCIDENT → UNDER_REPAIR →
  QC_PENDING → READY_TO_DEPLOY` (or `→ RETIRED`), every step with actor.
- The rider's ledger shows one charge, with the job code, on the week it was
  raised; the next weekly run includes it.

---

## Story 9 — Rider KYC lifecycle and eligibility

**As a compliance owner, I want a rider's documents to control what the
rider can do, so an unverified or rejected rider never gets a bike.**

**Flow & state changes:**
1. Onboarding creates the rider with KYC = `PENDING`. Aadhaar, PAN, driving
   licence recorded; verification flags per document.
2. Reviewer marks KYC `VERIFIED` (all mandatory documents verified) or
   `REJECTED` (with reason). Rider status stays `ACTIVE` either way; KYC is
   a gate, not a status.
3. Only `VERIFIED` riders appear in the assign picker. A `PENDING` rider can
   be onboarded and can pay a deposit, but cannot be handed a bike.
4. Documents expire (driving licence has an expiry date): on expiry the
   rider shows as `EXPIRED` in KYC and the next assignment or exchange is
   blocked until the licence is updated; a rider already on a bike is
   flagged on the dashboard, not stripped of the bike automatically.
5. Re-verification is a new record in the KYC history, never an overwrite.

**Valid data checks:**
- Aadhaar 12 digits, shown masked everywhere (`XXXX XXXX 1234`), never
  exported in full, never in a URL or search index.
- PAN `ABCDE1234F` shape; DL state code + number shape; expiry date in the
  future at the time of entry.
- Phone, WhatsApp and alternate numbers are 10 digits starting 6–9;
  alternate number must differ from the primary.

**Invalid data checks:**
- Assigning a bike to a `PENDING` or `REJECTED` rider via the API → refused.
- Same Aadhaar as an existing rider → a duplicate warning that names the
  existing rider's code; same phone → refused outright.
- Verifying KYC with a document field blank → refused.
- A rejected rider onboarding again with the same Aadhaar → treated as
  re-onboarding of the same person, not a second rider.

**State-change verification:**
- KYC changes appear in the audit log with reviewer, time, before/after.
- The riders list filter by KYC state matches the counts on the dashboard.

---

## Story 10 — Non-payment: overdue, suspension, vehicle recovery

**As a collections manager, I want a rider who stops paying to move through
clear stages, so that the bike comes back before the debt grows beyond the
deposit.**

**Flow & state changes:**
1. Payment due on the rider's payment day. Unpaid at end of day →
   `OVERDUE` for that period; rider appears on the overdue list with days
   late and amount.
2. After a grace period (configurable per tenant, say 3 days) the rider is
   `SUSPENDED` — still holds the bike physically, but no exchange, no plan
   change, flagged on every screen that shows them.
3. Recovery initiated: a help-desk job of type recovery, bike located, picked
   up → rider deboarded with reason `NON_PAYMENT`; outstanding dues computed
   from the ledger, deposit applied against them; bike → `QC_PENDING`.
4. Rider status → `INACTIVE` with the balance still on the ledger (positive
   or negative). A later payment settles it and reactivation is possible by
   an admin with a note.

**Valid data checks:**
- Overdue amount = sum of unpaid periods + open charges − credits; shown in
  rupees, computed in paise, same number on the rider detail, the overdue
  list and the recovery summary.
- Grace period counts calendar days in the tenant's time zone.

**Invalid data checks:**
- Collecting a payment from a `SUSPENDED` rider must be allowed (it is how
  they come back); exchanging their bike must not.
- Deboarding for non-payment with `outstandingRent` smaller than the ledger
  says → the operator is warned and must confirm or correct; it may never be
  silently accepted at a lower figure.
- Marking a period `PAID` manually without a collection row → impossible;
  status is derived from collections, never set by hand.

**State-change verification:**
- Once the overdue period is paid, the rider leaves the overdue list
  immediately and the suspension lifts in the same transaction.
- Recovery summary totals equal the sum of the listed riders.

---

## Story 11 — Plan and billing-day changes mid-contract

**As a fleet admin, I want to change a rider's weekly plan or payment day
without corrupting the current week's bill.**

**Flow & state changes:**
1. Plan change requested with a reason → takes effect from the next billing
   period; the current period keeps the old amount. The change is a new row
   in the rider's change log (old, new, who, when, effective from).
2. Billing-day change → takes effect from the next full week; no period may
   be shorter than 7 days or overlap another.
3. Both are blocked while the rider is `SUSPENDED` or has a pending
   settlement.

**Valid data checks:**
- Plan more than zero, at most the tenant's ceiling (₹25,000/week).
- Effective-from date defaults to next period start; may be set later, never
  earlier than tomorrow.

**Invalid data checks:**
- Plan change to the same amount → refused as "no change".
- Two plan changes submitted within a second (double click) → one row.
- Changing the billing day so that two periods overlap → refused.
- Plan change on an `INACTIVE` rider → refused.

**State-change verification:**
- The next weekly run uses the new amount; the current run is unchanged
  even if regenerated.
- The change log shows each change once with the actor's name, not an id.

---

## Story 12 — Deposit lifecycle

**As an accountant, I want the deposit to be traceable from the first rupee
collected to the last rupee refunded.**

**Flow & state changes:**
1. Onboarding sets the deposit plan and records what was paid; shortfall is
   visible on the rider ("₹1,000 of ₹3,000 collected").
2. Top-ups are collections tagged as deposit; deposit held increases; a
   top-up above the plan is refused.
3. Deductions: a closed job with liability `DEPOSIT` reduces deposit held
   by the charge; the rider sees the deduction with the job code.
4. Deboard: refund ≤ deposit held after deductions and after outstanding rent
   is netted; the settlement is approved by a second person before the money
   leaves; approval writes the ledger rows; deposit held becomes zero.
5. A rider with deposit shortfall cannot take a second bike (exchange is
   allowed, a second concurrent assignment never is).

**Invalid data checks:**
- Deposit paid > plan at onboarding → refused.
- Refund > held → refused.
- Approving the same settlement twice → second is a no-op with "already
  approved", no double ledger rows.
- Deposit held going negative by any path → impossible; the operation that
  would cause it is refused.

**State-change verification:**
- For any rider: deposit plan − deposit held = shortfall + deductions +
  refunds, and every term has rows behind it.

---

## Story 13 — Bulk vehicle upload, end to end

**As a fleet admin importing 200 bikes from a spreadsheet, I want a dry run
first and exactly what I approved committed, nothing else.**

**Flow & state changes:**
1. Download template → fill → upload → preview shows every row as OK or
   with a reason; nothing is saved yet.
2. Fix the file, upload again → the previous preview is gone; only this
   file's rows are shown.
3. Confirm → only OK rows are created, each `INDUCTED` with a lifecycle
   entry naming the import; error rows are listed for export.

**Valid data checks:**
- Headers are matched case- and space-insensitively with known aliases
  (`Chassis No`, `VIN`, `chassis_number`).
- Dates in ISO, dd/mm/yyyy, dd-mm-yyyy and Excel serials are all read as
  the same date.
- A file of exactly the row limit passes; one row over is refused with the
  limit named.

**Invalid data checks:**
- Duplicate chassis within the file → both rows flagged, neither created.
- Chassis that exists in the fleet → row flagged with the existing bike's id.
- A `.xls`, a CSV with a BOM, a sheet with 16,000 columns, a 50 MB file, a
  password-protected workbook → clear error, server stays up.
- Confirming a preview older than its validity, or confirming twice → second
  confirm is refused; no duplicate bikes.
- Two admins uploading at the same time → each sees only their own preview.

**State-change verification:**
- Fleet count rises by exactly the number of OK rows; the audit log has one
  import entry naming the file, the actor and the counts.

---

## Story 14 — Roadside assistance and walk-in repairs

**As a help-desk operator, when a rider rings from the road I want to open a
job, get the bike in, fix it, and know who pays, without the rider's contract
being disturbed.**

**Flow & state changes:**
1. Job opened with source `RSA` (rider on the road) or `WALK_IN` (rider at
   the hub) on a `DEPLOYED` bike; rider auto-filled from the assignment and
   shown as "name · R01". Bike → `UNDER_REPAIR` (or `ACCIDENT`). The
   assignment stays open: the rider still holds this bike.
2. For a long repair the rider may be exchanged (Story 3); the job keeps the
   original rider as the person liable.
3. Work recorded (technician, parts, labour, cost); → `QC_PENDING` → QC
   pass → `READY_TO_DEPLOY` or, if the same rider still holds it, back to
   `DEPLOYED` after a return handover is recorded.
4. Close with liability → zero or one charge on the rider.

**Invalid data checks:**
- A second open job on the same bike → refused, names the open job code.
- Moving to `QC_PENDING` without technician and work summary → refused.
- Warranty/insurance queue without a reference → refused.
- Closing as `RIDER` when no rider is on the job → refused; the company
  covers it.
- Negative or decimal paise cost line → refused.
- Closing by a service manager → refused (fleet decides money).

**State-change verification:**
- The job's activity log reads as a story: opened, moved, worked, QC'd,
  closed, each with actor and time, newest last.
- The rider's detail shows the job under "repairs" with the code `J01`, not
  an internal id.

---

## Story 15 — Payment corrections, reversals and receipts

**As a cashier, I will make mistakes; I want to correct them in a way an
auditor can follow.**

**Flow & state changes:**
1. Payment recorded (amount, method, reference) → receipt number issued
   sequentially per tenant, never reused, never skipped.
2. Wrong amount → a reversal row (negative, references the original) and a
   new collection; the original is never edited or deleted.
3. Overpayment → the period shows `PAID` and the excess is a credit carried
   into the next period, visible on the rider as "credit ₹500".
4. A refund of credit → a payout row with approval, like a settlement.

**Valid data checks:**
- Amount > 0 in whole paise; method from the allowed list; UPI/bank
  reference mandatory for non-cash.
- Receipt shows rider code, period, amount in words and figures, collector.

**Invalid data checks:**
- Recording against a future period → refused.
- Recording for an `INACTIVE` rider → allowed only if they owe something.
- Reversal larger than the original → refused.
- Same reference number twice for the same rider → warned as a probable
  duplicate.
- Network drop after submit → the UI must not say "paid" until the server
  confirmed; a retry with the same idempotency key records once.

**State-change verification:**
- Sum of collections − reversals per period = amount paid shown on the run;
  the overdue list, the run and the receipt agree to the paisa.

---

## Story 16 — Users, roles and tenant isolation

**As an owner of a franchise, I want my staff to see only my fleet and do
only their job.**

**Flow & state changes:**
1. Admin invites a user with a role → user `INVITED` until first login →
   `ACTIVE`. Role change is logged (old, new, who, when).
2. Deactivating a user ends their sessions within a minute; their past
   actions keep their name in every log.
3. Roles: fleet staff cannot change money or close jobs; service manager
   cannot touch riders' money or deboard; only admins change roles.

**Invalid data checks:**
- A user from tenant A calling any endpoint with tenant B's codes → 404,
  never 403 (existence must not leak).
- The last admin of a tenant demoting themselves → refused.
- A deactivated user's token → 401 everywhere, including file download.
- A role string the system does not know → refused.

**State-change verification:**
- Audit log entries for role changes name both users by name and code, not
  by id.

---

## Story 17 — Day-boundary and time-zone edges

**As the system, I must bill the right week whatever time of day it is.**

- A payment recorded at 23:59 IST on the payment day counts for that day;
  one at 00:01 IST next day is late. Server time zone must not change this.
- Billing day change across a month end, a year end, and a week containing
  a public holiday: periods remain exactly 7 days.
- A rider onboarded on their own billing day starts a full period that day.
- A deboard dated today after today's run was generated: the current period
  is settled pro-rata or in full by policy, stated on the settlement, never
  billed again next week.
- A QC pass at 23:59 and an assignment at 00:01 produce a lifecycle in the
  right order on the same bike.

---

## Story 18 — Complex chains that must stay consistent

Each chain is run end to end; after every step the three views (vehicle,
rider, money) are checked against each other.

1. **Same-day churn:** assign R01 → BLRSS0428 at 09:00, exchange to
   BLRSS0430 at 11:00, exchange back to BLRSS0428 at 13:00 after QC, deboard
   at 17:00. Expect: one open assignment at any instant, every closed one
   with a reason, both bikes end `QC_PENDING`, one week billed once.
2. **Exchange during repair:** bike in `UNDER_REPAIR` with an open job;
   rider exchanged onto another bike. Expect: job keeps the rider as liable,
   assignment moves, closing the job later charges the right rider.
3. **Deboard while in workshop:** rider deboards while their bike is in the
   workshop. Expect: refused until the job is closed, or accepted with the
   bike staying in its workshop state (not forced to `QC_PENDING`), stated
   clearly either way.
4. **QC fails twice then retire:** two failed sheets with reasons, bike
   retired from `UNDER_REPAIR` with the job cancelled. Expect: both sheets
   in history, lifecycle readable, no charge raised.
5. **Returned bike reused same day:** deboard → QC pass → assign to another
   rider within an hour. Expect: both assignments visible on the bike's
   history, no overlap, dashboard counts correct at each step.
6. **Two desks, one bike:** two operators assign the same `READY_TO_DEPLOY`
   bike to two riders at the same second. Expect: exactly one succeeds; the
   other gets a message naming the rider who got it.
7. **Two desks, one rider:** two operators assign two bikes to the same
   rider at once. Expect: one succeeds; the rider never holds two bikes.
8. **Retry storms:** every POST in the chains above is replayed with the
   same idempotency key after a simulated timeout. Expect: no duplicate
   rows, same response.
9. **Import then act:** a bike imported at 10:00 is inspected, QC'd,
   assigned and exchanged by 12:00. Expect: lifecycle starts with the import
   entry and the actor who confirmed it.
10. **Cross-tenant replay:** every step above repeated with tenant B's token
    against tenant A's codes. Expect: 404s, no side effects in A.

---

## Cross-Cutting Checklist — additions

- **No internal ids on screen:** every list, detail, URL, export, error
  message and audit row names records by their codes (`R01`, `J01`,
  `BLRSS0428`); a UUID anywhere visible is a defect.
- **Masking:** Aadhaar masked on screen and in exports; full value never
  leaves the server. Phone numbers partially masked for non-admin roles.
- **Search:** every list is searchable by code, name and phone fragment;
  search is case-insensitive and tolerates spaces and hyphens.
- **Pagination:** no list loads everything; totals on the page match the
  dashboard count for the same filter.
- **Exports:** CSV export of any list equals what is on the screen with the
  same filter, including codes, not ids.
- **Slow network:** every submit button shows progress and cannot be pressed
  again until the server answers; a timeout shows a retry that is safe.
- **Mobile:** every form is usable one-handed at 360 px wide; nothing
  requires horizontal scrolling to find the submit button.
- **Error wording:** every refusal says what to do next, in the user's
  language, never a stack trace, never a constraint name.
