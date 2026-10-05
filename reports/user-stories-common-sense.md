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
