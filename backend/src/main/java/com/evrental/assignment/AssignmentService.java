package com.evrental.assignment;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import com.evrental.rider.Rider;
import com.evrental.rider.RiderService;
import com.evrental.rider.RiderStatus;
import com.evrental.service.DamageCategory;
import com.evrental.service.ServiceJobFacade;
import com.evrental.service.ServiceJobSource;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import com.evrental.vehicle.VehicleState;
import com.evrental.vehicle.VehicleTransitions;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The three recorded assignment events: assign, exchange, deboard.
 *
 * <p>Every bike move goes through {@link VehicleTransitions#transitionState},
 * so the lifecycle log stays complete; every return routes the bike through
 * the S4 facade ({@link ServiceJobFacade#openJob}), so a damaged bike cannot
 * skip the workshop; and the rider's status door is
 * {@link RiderService#markDeboarded}. The assignment row is written here and
 * read everywhere else through {@link AssignmentQuery}.
 *
 * <p>Each method is one transaction: the assignment rows, the job, the bike
 * moves and the deboard commit together, or none of them do — a rider
 * deboarded while the bike stayed out with them is the spreadsheet's failure
 * this module exists to make unreachable.
 *
 * <p>The rules and their wording come from the mock
 * (frontend/app/src/lib/api/assignments.ts), where the screens have relied on
 * them since the prototype. The one deliberate divergence, recorded in the S5
 * plan: the bike goes where the damage category routes it (openJob), and the
 * operator's nextVehicleState is recorded as a fact on the closing row — an
 * override of the condition's default is documented, not silently obeyed.
 */
@Service
public class AssignmentService {

    /** The four destinations a return may choose. Mirrors RETURN_DESTINATIONS in lib/serviceWorkflow.ts. */
    private static final Set<VehicleState> RETURN_DESTINATIONS =
            EnumSet.of(VehicleState.QC_PENDING, VehicleState.UNDER_REPAIR, VehicleState.ACCIDENT);

    private final AssignmentRepository assignments;
    private final RiderService riders;
    private final VehicleRepository vehicles;
    private final VehicleTransitions vehicleTransitions;
    private final ServiceJobFacade serviceJobs;
    private final com.evrental.payment.SettlementLedger settlements;
    private final com.evrental.rider.RiderPaymentStatusQuery dues;

    public AssignmentService(AssignmentRepository assignments,
                             RiderService riders,
                             VehicleRepository vehicles,
                             VehicleTransitions vehicleTransitions,
                             ServiceJobFacade serviceJobs,
                             com.evrental.payment.SettlementLedger settlements,
                             com.evrental.rider.RiderPaymentStatusQuery dues) {
        this.assignments = assignments;
        this.riders = riders;
        this.vehicles = vehicles;
        this.vehicleTransitions = vehicleTransitions;
        this.serviceJobs = serviceJobs;
        this.settlements = settlements;
        this.dues = dues;
    }

    /** Assign, as a fleet hand calls it: no say over dues above the deposit. */
    @Transactional
    public Rider assign(AssignVehicleRequest request, UUID tenantId, UUID actorUserId, String actorName) {
        return assign(request, tenantId, actorUserId, actorName, false);
    }

    /**
     * A bike goes out to a rider. The rider must be on the register and
     * holding nothing; the bike must be in the yard with nobody on it. The
     * partial unique indexes back both checks under a race — the first writer
     * wins and the second gets a 409 from the index, not from a
     * read-then-write race.
     */
    /**
     * A bike goes out to a rider.
     *
     * <p>Three rules a desk would expect, settled with Sumukh on 2026-10-05:
     * a deboarded rider is "done with that bike", not gone, so assigning them
     * puts them back on the register here, in the same transaction; dues
     * never reset and are carried on the ledger, so they are shown and
     * confirmed rather than blocking; and the deposit is the limit — a rider
     * who owes more than the company holds does not get a bike unless an
     * admin says so, with a note, and the lifecycle log records both.
     *
     * @param canOverrideDues whether the caller's role may approve a bike
     *                        going out above the deposit (fleet admin or
     *                        super admin)
     */
    @Transactional
    public Rider assign(AssignVehicleRequest request, UUID tenantId, UUID actorUserId, String actorName,
                        boolean canOverrideDues) {
        Rider found = riders.findByRiderCode(request.riderId());
        boolean putBack = found.getStatus() == RiderStatus.DEBOARDED || found.getStatus() == RiderStatus.INACTIVE;
        Rider rider = putBack ? riders.reactivate(found.getId()) : found;
        requireActive(rider);

        // Rent starts on this date. One that has not come yet would bill
        // for days nobody rode — and "today" is today in IST, where the
        // fleet is, not in the UTC the container runs in.
        if (request.startedOn().isAfter(java.time.LocalDate.now(com.evrental.payment.BillingClock.ZONE))) {
            throw new com.evrental.common.ValidationException("startedOn", "Assignment date cannot be in the future");
        }

        assignments.findOpenByRiderId(rider.getId()).ifPresent(open -> {
            throw new ConflictException(rider.getName() + " already holds " + registryIdOf(open.getVehicleId())
                    + ". Use Exchange vehicle instead.", "riderId");
        });

        Vehicle vehicle = vehicles.findByRegistryId(request.vehicleId().trim())
                .orElseThrow(() -> NotFoundException.of("Vehicle", request.vehicleId()));
        if (vehicle.getState() != VehicleState.READY_TO_DEPLOY
                || assignments.findOpenByVehicleId(vehicle.getId()).isPresent()) {
            throw new ConflictException(vehicle.getRegistryId() + " is not Ready to Deploy", "vehicleId");
        }

        long owed = dues.owedPaiseFor(List.of(rider.getId())).getOrDefault(rider.getId(), 0L);
        boolean overridden = false;
        if (owed > rider.getDepositHeldPaise()) {
            boolean asked = Boolean.TRUE.equals(request.overrideDues());
            if (!asked || !canOverrideDues) {
                throw new ValidationException("dues", rider.getName() + " owes " + rupees(owed)
                        + " against a deposit of " + rupees(rider.getDepositHeldPaise())
                        + " — collect first, or an admin can override with a note");
            }
            if (request.note() == null || request.note().isBlank()) {
                throw new ValidationException("note", "Say why the bike is going out despite the dues");
            }
            overridden = true;
        }

        Assignment assignment = new Assignment();
        assignment.setTenantId(tenantId);
        assignment.setRiderId(rider.getId());
        assignment.setVehicleId(vehicle.getId());
        assignment.setStartedOn(request.startedOn());
        assignment.setNote(blankToNull(request.note()));
        saveOrConflict(assignment);

        // The lifecycle line is the audit trail's record of this decision, so
        // it says everything that was decided: the rider came back on, what
        // they owed, and who waved it through.
        StringBuilder note = new StringBuilder("Assigned to ").append(rider.getName());
        if (putBack) {
            note.append(" — put back on the register");
        }
        if (owed > 0) {
            note.append(" — owes ").append(rupees(owed));
        }
        if (overridden) {
            note.append("; above the deposit, admin override by ").append(actorName)
                    .append(": ").append(request.note().trim());
        }
        vehicleTransitions.transitionState(
                vehicle.getId(), VehicleState.DEPLOYED, note.toString(), actorUserId, actorName);
        return rider;
    }

    /** Whole rupees with Indian grouping, as the screens print money: ₹3,00,000. */
    private static String rupees(long paise) {
        return "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale.of("en", "IN")).format(paise / 100);
    }

    /**
     * Two events, never an overwrite: the old assignment closes with a
     * condition and a new one opens. The bike coming back takes the same route
     * a deboarded bike does — openJob — so a swap cannot quietly put a damaged
     * bike back in the yard.
     */
    @Transactional
    public Rider exchange(ExchangeVehicleRequest request, UUID tenantId, UUID actorUserId, String actorName) {
        Rider rider = riders.findByRiderCode(request.riderId());
        requireActive(rider);

        Assignment open = assignments.findOpenByRiderId(rider.getId())
                .orElseThrow(() -> new ConflictException(
                        rider.getName() + " is not holding " + request.fromVehicleId(), "fromVehicleId"));
        Vehicle from = vehicles.findById(open.getVehicleId())
                .orElseThrow(() -> NotFoundException.of("Vehicle", open.getVehicleId()));
        if (!from.getRegistryId().equals(request.fromVehicleId().trim())) {
            throw new ConflictException(
                    rider.getName() + " is not holding " + request.fromVehicleId(), "fromVehicleId");
        }
        if (request.toVehicleId().trim().equals(request.fromVehicleId().trim())) {
            throw new ConflictException("Pick a different bike to exchange onto", "toVehicleId");
        }
        Vehicle to = vehicles.findByRegistryId(request.toVehicleId().trim())
                .orElseThrow(() -> NotFoundException.of("Vehicle", request.toVehicleId()));
        if (to.getState() != VehicleState.READY_TO_DEPLOY
                || assignments.findOpenByVehicleId(to.getId()).isPresent()) {
            throw new ConflictException(to.getRegistryId() + " is not Ready to Deploy", "toVehicleId");
        }
        requireWithinAssignment(request.occurredOn(), open, "occurredOn", "Exchange date");

        String damageNotes = damageNotes(request.returnCondition(), request.damageItems());
        validateReturn(request.returnCondition(), request.nextVehicleState(), request.note(), request.damageItems());

        // Closed before the new row is inserted, and flushed, so the partial
        // unique index never sees two open rows for one rider: Hibernate would
        // otherwise order the insert before the update within the flush.
        close(open, request.occurredOn(), request.reason().name(), request.returnCondition(),
                request.nextVehicleState(), damageNotes, null, null, actorName);

        Assignment next = new Assignment();
        next.setTenantId(tenantId);
        next.setRiderId(rider.getId());
        next.setVehicleId(to.getId());
        next.setStartedOn(request.occurredOn());
        saveOrConflict(next);

        serviceJobs.openJob(tenantId, from.getRegistryId(), rider.getId(), ServiceJobSource.EXCHANGE,
                request.returnCondition(), jobNote(request.reason().name(), damageNotes, request.note()), actorName);
        vehicleTransitions.transitionState(
                to.getId(), VehicleState.DEPLOYED, "Assigned to " + rider.getName(), actorUserId, actorName);
        return rider;
    }

    /**
     * The gate: nothing else closes an assignment. The rider comes off the
     * active register, because a rider with no bike and no plan running is not
     * active — they are re-activated by the next onboarding. The settlement
     * figures are recorded as facts on the closing row; S6's second half turns
     * them into ledger rows under FA approval.
     */
    @Transactional
    public Rider deboard(DeboardRiderRequest request, UUID tenantId, UUID actorUserId, String actorName) {
        Rider rider = riders.findByRiderCode(request.riderId());

        Assignment open = assignments.findOpenByRiderId(rider.getId())
                .orElseThrow(() -> new ConflictException(
                        rider.getName() + " is not holding " + request.vehicleId(), "vehicleId"));
        Vehicle vehicle = vehicles.findById(open.getVehicleId())
                .orElseThrow(() -> NotFoundException.of("Vehicle", open.getVehicleId()));
        if (!vehicle.getRegistryId().equals(request.vehicleId().trim())) {
            throw new ConflictException(
                    rider.getName() + " is not holding " + request.vehicleId(), "vehicleId");
        }
        requireWithinAssignment(request.returnedOn(), open, "returnedOn", "Return date");
        // The register holds the deposit; it cannot give back more than it holds.
        if (request.depositRefund() > rider.getDepositHeldPaise()) {
            throw new ValidationException("depositRefund", "Deposit refund cannot be more than the deposit held");
        }

        String damageNotes = damageNotes(request.returnCondition(), request.damageItems());
        validateReturn(request.returnCondition(), request.nextVehicleState(), request.note(), request.damageItems());

        close(open, request.returnedOn(), request.reason().name(), request.returnCondition(),
                request.nextVehicleState(), damageNotes,
                request.outstandingRent(), request.depositRefund(), actorName);

        serviceJobs.openJob(tenantId, vehicle.getRegistryId(), rider.getId(), ServiceJobSource.DEBOARD,
                request.returnCondition(), jobNote(request.reason().name(), damageNotes, request.note()), actorName);
        riders.markDeboarded(rider.getId());
        return rider;
    }

    // -----------------------------------------------------------------------
    // The return rules, in the mock's own words
    // -----------------------------------------------------------------------

    /**
     * The rules that used to live only in the browser (lib/schemas/assignment.ts
     * and the mock's returnNote). Their messages are the mock's wording, so a
     * screen that already prints one keeps printing the same sentence. The mock
     * answered 400; the S4 precedent (ServiceJobService.checkSaveRules) answers
     * 422, and the UI handles both the same way.
     */
    private void validateReturn(DamageCategory condition, VehicleState nextState,
                                String note, List<DamageItem> damageItems) {
        if (!RETURN_DESTINATIONS.contains(nextState)) {
            throw new ValidationException("nextVehicleState", "Choose a return destination");
        }
        if (condition == DamageCategory.NONE && damageItems != null && !damageItems.isEmpty()) {
            throw new ValidationException("damageItems",
                    "Clear the damaged-part rows or choose a damage severity");
        }
        if (condition != DamageCategory.NONE
                && (damageItems == null || damageItems.isEmpty()
                    || damageItems.stream().anyMatch(i -> i.part() == null || i.part().isBlank()))) {
            throw new ValidationException("damageItems",
                    "Record the damaged parts before returning this bike");
        }
        if (nextState != defaultDestination(condition) && (note == null || note.isBlank())) {
            throw new ValidationException("note", "Explain the destination override");
        }
    }

    /** Where a condition routes a bike by default. Mirrors CONDITION_DEFAULT_STATE in lib/labels.ts. */
    private static VehicleState defaultDestination(DamageCategory condition) {
        return switch (condition) {
            case NONE -> VehicleState.QC_PENDING;
            case MINOR, MAJOR -> VehicleState.UNDER_REPAIR;
            case ACCIDENT -> VehicleState.ACCIDENT;
        };
    }

    /** The part-level detail, joined the way the mock's returnNote joins it. */
    /**
     * A return or swap is dated, and the date becomes the close of one
     * assignment and the start of the next. One before the rider ever had
     * the bike, or one that has not come yet, was accepted — so rent for the
     * replacement started in the past or the future. Today is today in IST.
     */
    private static void requireWithinAssignment(java.time.LocalDate on, Assignment open, String field, String label) {
        if (on.isBefore(open.getStartedOn())) {
            throw new ValidationException(field, label + " cannot be before the assignment began");
        }
        if (on.isAfter(java.time.LocalDate.now(com.evrental.payment.BillingClock.ZONE))) {
            throw new ValidationException(field, label + " cannot be in the future");
        }
    }

    private String damageNotes(DamageCategory condition, List<DamageItem> damageItems) {
        if (condition == DamageCategory.NONE) {
            return "No damage reported";
        }
        return damageItems.stream()
                .map(i -> i.part().trim() + ": "
                        + (i.note() == null || i.note().isBlank() ? "Damage reported" : i.note().trim()))
                .collect(Collectors.joining("; "));
    }

    /** The job's damageNotes, exactly as the mock builds it: reason, damage, operator note. */
    private String jobNote(String reason, String damageNotes, String note) {
        return java.util.stream.Stream.of(reason, damageNotes, blankToNull(note))
                .filter(Objects::nonNull)
                .collect(Collectors.joining("\n"));
    }

    // -----------------------------------------------------------------------
    // Shared
    // -----------------------------------------------------------------------

    private void requireActive(Rider rider) {
        if (rider.getStatus() != RiderStatus.ACTIVE) {
            throw new ConflictException(rider.getName() + " is " + rider.getStatus().label().toLowerCase()
                    + " and cannot hold a bike", "riderId");
        }
    }

    /** Closes the row with the return facts. Flushed, not merely saved — see exchange(). */
    private void close(Assignment open, LocalDate endedOn, String reason, DamageCategory condition,
                       VehicleState nextState, String damageNotes, Long outstandingRent, Long depositRefund,
                       String actorName) {
        open.setEndedOn(endedOn);
        open.setReason(reason);
        open.setReturnCondition(condition);
        open.setNextVehicleState(nextState);
        open.setDamageNotes(damageNotes);
        open.setOutstandingRentPaise(outstandingRent);
        open.setDepositRefundPaise(depositRefund);
        open.setClosedBy(actorName);
        assignments.saveAndFlush(open);
    }

    /**
     * The partial unique indexes are the only thing standing between two
     * simultaneous assigns and two open assignments for one rider or one bike.
     * Reading first and writing second would be a race however carefully it
     * were written, so the write is attempted and the violation translated —
     * the same pattern as ServiceJobService.saveOrConflict.
     */
    private Assignment saveOrConflict(Assignment assignment) {
        try {
            return assignments.saveAndFlush(assignment);
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException("That rider or bike already has an open assignment");
        }
    }

    private String registryIdOf(UUID vehicleId) {
        return vehicles.findById(vehicleId).map(Vehicle::getRegistryId).orElse(null);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    // -----------------------------------------------------------------------
    // Settlement approval
    // -----------------------------------------------------------------------

    /** Closed assignments whose settlement nobody has acted on yet. */
    @Transactional(readOnly = true)
    public List<SettlementResponse> pendingSettlements() {
        return assignments.findBySettlementApprovedOnIsNullAndEndedOnIsNotNullOrderByEndedOnDesc().stream()
                .filter(a -> hasMoney(a))
                .map(this::toSettlement)
                .toList();
    }

    /**
     * Turns a deboard's recorded figures into ledger entries.
     *
     * <p>S5 writes outstanding rent and the deposit refund onto the closing
     * row and deliberately stops: whether they are real is a Fleet Admin's
     * decision. This is where that decision is recorded, and it is the only
     * thing that moves the money.
     *
     * <p>Approving twice is refused rather than ignored. A second approval
     * would raise a second charge for the same rent, and "it looked like
     * nothing happened so I clicked again" is how that occurs.
     */
    @Transactional
    public SettlementResponse approveSettlement(UUID assignmentId, String actorName) {
        Assignment row = assignments.findById(assignmentId)
                .orElseThrow(() -> NotFoundException.of("Assignment", assignmentId));
        if (row.getEndedOn() == null) {
            throw new ConflictException("This assignment is still open; there is nothing to settle");
        }
        if (row.getSettlementApprovedOn() != null) {
            throw new ConflictException("This settlement was already approved by " + row.getSettlementApprovedBy());
        }

        UUID chargeId = settlements.settle(
                row.getTenantId(),
                row.getRiderId(),
                row.getOutstandingRentPaise() == null ? 0 : row.getOutstandingRentPaise(),
                row.getDepositRefundPaise() == null ? 0 : row.getDepositRefundPaise());

        row.setSettlementApprovedBy(actorName);
        row.setSettlementApprovedOn(java.time.Instant.now());
        row.setSettlementChargeId(chargeId);
        assignments.save(row);
        return toSettlement(row);
    }

    private static boolean hasMoney(Assignment a) {
        long rent = a.getOutstandingRentPaise() == null ? 0 : a.getOutstandingRentPaise();
        long refund = a.getDepositRefundPaise() == null ? 0 : a.getDepositRefundPaise();
        return rent > 0 || refund > 0;
    }

    private SettlementResponse toSettlement(Assignment a) {
        Rider rider = riders.findById(a.getRiderId());
        return new SettlementResponse(
                a.getId().toString(),
                rider.getRiderCode(),
                rider.getName(),
                vehicles.findById(a.getVehicleId()).map(com.evrental.vehicle.Vehicle::getRegistryId).orElse(null),
                a.getEndedOn(),
                a.getOutstandingRentPaise() == null ? 0 : a.getOutstandingRentPaise(),
                a.getDepositRefundPaise() == null ? 0 : a.getDepositRefundPaise(),
                a.getSettlementApprovedBy(),
                a.getSettlementApprovedOn());
    }
}
