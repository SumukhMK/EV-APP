# Vehicle Service Management: Walk-in & RSA / Hub Service

**Status:** Product/workflow proposal — documentation only  
**Reference:** `Job Card Management` image supplied with the request  
**Scope:** Divide vehicle service operations into two distinct job-card categories. This document does not change the application or backend.

---

## Goal

The service-management area should present two separate operational workspaces:

1. **Walk-in & RSA** — service work for a vehicle that is still associated with an active rider, whether the rider brings it in or the roadside-assistance team recovers it for service.
2. **Hub Service** — workshop work for a vehicle returned by a rider or recovered from a rider and now handled at a hub, without selecting an active rider during job creation.

The split is based on **who/what the service team is handling and where the vehicle enters the workflow**, not merely on the repair type. Both categories should produce traceable job cards, but their intake requirements and operational status summaries differ.

## 1. Walk-in & RSA

### Purpose

Open and manage a job card for an active rider's vehicle when:

- the rider brings the vehicle in for service (**Walk-in**); or
- the vehicle is attended to through roadside assistance (**RSA**).

### Intake rules

- The vehicle is expected to be assigned to an active rider when the job is opened.
- Identify the rider and vehicle together; display both on the job card.
- Record the repair type, issue/damage notes, intake source, and the person who created the card.
- For RSA, capture the roadside location and relevant assistance/recovery details. For a walk-in, capture the hub or intake location as appropriate.
- Do not treat a returned/deboarded vehicle as an active-rider Walk-in/RSA case; route it to Hub Service.

### Board and statuses

The reference image summarizes this category with counts for:

- **Open**
- **In Progress**
- **Closed**

The job-card list should make the rider and vehicle immediately identifiable and show ticket, repair type, created by, resolved by, status, and available actions. Status changes and resolution should retain the existing service history/audit behavior.

### Primary action

**Open Job Card** — start a service record for an active rider's vehicle.

### Expected job-card form

The **Open Walk-in / RSA Job Card** form should use the following fields and behavior, as shown in the supplied job-card reference:

| Field | Expected behavior |
|---|---|
| Service Category | Defaults to/displays **Walk-in & RSA** for this entry point. |
| Active Rider | Required selector limited to existing active riders. Prompt: “Select active rider”. |
| Vehicle ID | Auto-filled from the selected active rider; do not ask the operator to select an unrelated vehicle. |
| Rider ID | Display or capture the selected rider's identifier alongside the active-rider selection. |
| Repair Type | Selector; reference defaults to **Repair only**. |
| Ticket Created By (Executive) | Required or recorded executive/operator name. |
| Ticket Resolved By (Technician) | Technician name, entered when the repair is done; it may be blank at initial creation. |
| Initial / Current Remarks | Notes for the vehicle issue, inspection findings, or repair notes. |

The form explains the billing rule: **only an unpaid spare-parts balance is added to Weekly Payments.** For a **Repair only** job, no spare part is required. Provide **Cancel** and **Create Job Card** actions; creation opens the job card in the Walk-in & RSA board.

## 2. Hub Service

### Purpose

Open and manage a job card for an inactive/returned vehicle that has come into hub custody because it was:

- returned by a rider; or
- recovered from a rider.

This workspace represents workshop handling after the vehicle has left the active rider assignment. The intake must not require selecting an active rider.

### Intake rules

- Select the returned/recovered vehicle by its vehicle ID.
- Do not show an active-rider selector. A historical rider/assignment may remain linked for traceability when known, but it is not a required intake choice and must not make the vehicle appear currently assigned.
- Record **Return / Recovery Source**, repair type, intake creator, assigned technician, and current stage as available.
- Carry forward return condition, damage notes, and the originating return/recovery event when present.
- Maintain continuity with the assignment and service records; do not create a second, conflicting “current rider” relationship.

### Board and stages

The reference image summarizes Hub Service with counts for:

- **Under Repair**
- **Parts Waiting**
- **QC Pending**

The job-card list should show ticket, vehicle ID, return/recovery source, repair type, creator, technician, stage, and actions. The workflow should also support **Ready for Deployment (RFD)** as the terminal operational outcome after required work and release checks.

### Primary action

**Open Hub Job Card** — start a service record for a returned or recovered vehicle without choosing an active rider.

### Expected job-card form

The **Open Hub Service Job Card** form should use the following fields and behavior, as shown in the supplied Hub Service reference:

| Field | Expected behavior |
|---|---|
| Service Category | Displays **Hub Service**. |
| Eligible Inactive Vehicle (Returned / Recovery) | Required selector limited to inactive vehicles returned by riders or recovered from riders. Prompt: “Select returned or recovered vehicle”. Exclude active/deployed vehicles and explain the eligibility rule below the selector. |
| Repair Type | Selector; reference defaults to **Repair only**. |
| Ticket Created By (Executive) | Executive/operator name. |
| Ticket Resolved By (Technician) | Technician name, entered when the repair is done; it may be blank at initial creation. |
| Initial / Current Remarks | Notes for the vehicle issue, inspection findings, or repair notes. |
| Hub Service Stage | Selector; reference defaults to **Under Repair**. Use the agreed Hub Service stages, including Under Repair, Parts Waiting, and QC Pending; define how/when Ready for Deployment (RFD) is represented. |

The form must state: **“Hub Service is only for inactive vehicles returned by riders or recovered from riders. No rider payment fields are used.”** A **Repair only** job requires no spare part. Do not show rider selection, rider payment, weekly-payment, or rider charge fields in this form. Provide **Cancel** and **Create Job Card** actions, then put the created card into the selected Hub Service stage.

## Shared service principles

The two workspaces are separate entry points and queues, not duplicate service systems. They should share:

- one vehicle identity and lifecycle history;
- one job-card history with notes, work performed, technician, parts/labour costs, and timestamps;
- the existing service queues and QC record where applicable;
- role-based permissions, tenant isolation, and auditability;
- a clear link to the return, recovery, or active assignment that led to the service event.

Each job card should have one unambiguous category (`Walk-in & RSA` or `Hub Service`) and a source value that captures the specific intake path. A vehicle should not acquire duplicate simultaneously active jobs solely because it appears in both views. The category boards should be filtered views over the same authoritative records unless a later product decision explicitly calls for separate persistence.

## Workflow distinction

```text
Active rider's vehicle
  ├─ Rider arrives at service point ──> Walk-in & RSA job card
  └─ Roadside team attends ───────────> Walk-in & RSA job card

Rider returns vehicle / team recovers it
  └─ Vehicle becomes inactive/returned -> Hub Service job card
       └─ Repair / Parts Waiting -> QC Pending -> Ready for Deployment (RFD)
```

The handoff from an active-rider case to Hub Service must be explicit when the rider returns the vehicle or it is recovered. Preserve the prior job and assignment history; do not silently rewrite an existing card's origin.

## Mapping to the current project terminology

The current backend service domain already has source values including `WALK_IN`, `RSA`, `QRT`, `DEBOARD`, and `EXCHANGE`, along with queues such as `MINOR_REPAIR`, `MAJOR_REPAIR`, `PARTS_WAITING`, `QC_PENDING`, and `READY_TO_DEPLOY`. The current model also records a rider association as optional and associates service jobs with a vehicle.

This proposal groups those concepts operationally:

| Proposed workspace | Typical current source values | Operational interpretation |
|---|---|---|
| Walk-in & RSA | `WALK_IN`, `RSA` | Active-rider service intake; show rider and vehicle |
| Hub Service | `DEBOARD`, `EXCHANGE`, recovery-related intake; potentially `QRT` when the recovered vehicle is returned to the hub | Returned/recovered, inactive vehicle; no active-rider selection |

This mapping is a starting point, not a claim that every current source has already been classified in code. In particular, confirm whether `QRT` belongs exclusively to Hub Service or can also represent an RSA-side response. Keep **source** (how it arrived) distinct from **workspace/category** (which operational board owns it).

## Product decisions to confirm before implementation

1. **RSA ownership:** Should every RSA job remain in Walk-in & RSA from roadside dispatch through completion, or should a recovered vehicle move to Hub Service after physical handoff at the hub?
2. **QRT classification:** Is QRT a subtype of RSA, a Hub Service intake source, or a distinct source that can enter either workspace?
3. **Hub release gate:** Must every Hub Service vehicle pass QC before RFD, including jobs classified as repair-only or parts work?
4. **Closed vs. RFD:** Is RFD a job-card stage, a vehicle state reached after closing, or both? The reference shows QC Pending as a count but describes RFD as tracked; define whether the RFD count/list is also needed.
5. **Return/recovery source values:** Define the exact user-facing options and whether the originating assignment/return record is mandatory.
6. **Cost and liability:** Confirm whether Hub Service records costs and liability using the existing close-job process, and whether Walk-in & RSA follows the same rules.
7. **Active-job uniqueness:** Confirm the desired rule when a vehicle has an open Walk-in/RSA card at the time it is returned or recovered. Prefer a recorded handoff/continuation over duplicate open jobs.
8. **Form validation:** Confirm whether executive name and remarks are mandatory, whether a technician is required only at resolution, and which repair types require spare-part lines.
9. **Walk-in / RSA parts balance and collections:** Define how the spare-parts balance is calculated, what “unpaid” means, how partial payment is represented, and how the amount is surfaced in Weekly Payments. Do not add repair labour or the full job total to Weekly Payments unless separately approved.
10. **Hub Service stage transitions:** Define which roles may move a card between Under Repair, Parts Waiting, and QC Pending, and how the vehicle/job reaches RFD after QC.
11. **Hub Service vehicle eligibility:** Define how the picker determines an inactive vehicle is eligible (returned/deboarded or recovered), and whether a prior return/recovery record is required. The selector must not include active vehicles.

## Acceptance criteria for a future implementation

- Service management presents two clearly labeled workspaces: **Walk-in & RSA** and **Hub Service**.
- Walk-in & RSA job creation requires an identifiable active-rider/vehicle context and supports Walk-in and RSA intake details.
- Walk-in / RSA creation form has Service Category, Active Rider, auto-filled Vehicle ID, Rider ID, Repair Type, Ticket Created By (Executive), Ticket Resolved By (Technician), and Initial / Current Remarks fields.
- Repair-only jobs do not require spare parts; only an unpaid spare-parts balance is sent to Weekly Payments, subject to the confirmed billing rules.
- Hub Service job creation is limited to an **Eligible Inactive Vehicle (Returned / Recovery)** and does not ask the operator to choose an active rider.
- Hub Service creation form includes Service Category, eligible inactive vehicle, Repair Type, Ticket Created By (Executive), Ticket Resolved By (Technician), Initial / Current Remarks, and Hub Service Stage (default **Under Repair**).
- Hub Service form clearly states that it is only for inactive returned/recovered vehicles and that no rider payment fields are used; Repair-only jobs require no spare part.
- Hub Service records the return/recovery source, repair type, creator, technician, and stage.
- Each workspace has its own appropriate summary counts and list columns as shown in the reference image.
- Hub workflow can represent Under Repair, Parts Waiting, QC Pending, and the agreed RFD outcome.
- The split preserves assignment, vehicle-lifecycle, job-event, cost, and QC histories without duplicate active service records or contradictory rider/vehicle assignments.
- Backend authorization and tenant isolation remain authoritative; hiding a workspace in the UI alone is not a security control.

---

*This file records the requested product direction only. No application code, schema, API, configuration, or existing documentation has been changed as part of this proposal.*
