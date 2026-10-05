package com.evrental.rider;

import com.evrental.assignment.AssignmentQuery;
import com.evrental.common.AadhaarCipher;
import com.evrental.common.ConflictException;
import com.evrental.common.Facet;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import com.evrental.common.PageResponse;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The rider register.
 *
 * <p>onboard() is the only door onto the register in S2. A rider joins ACTIVE
 * with KYC pending and no bike; nothing changes any of those yet — assignment
 * (S5) and any future verify/suspend/deboard step will be their own doors,
 * the way VehicleService.transitionState() is the only door to a bike's state.
 * S5's deboard is one of those doors: {@link #markDeboarded} is the only code
 * that writes DEBOARDED.
 *
 * <p>A rider's bike is not stored here. currentVehicleId is a property of the
 * open assignment, which S5 owns; this service reads it through
 * {@link AssignmentQuery}, the one interface the rider module imports from the
 * assignment module.
 */
@Service
public class RiderService {

    private final RiderRepository riders;
    private final AadhaarCipher aadhaarCipher;
    private final AssignmentQuery assignmentQuery;
    private final RiderPaymentStatusQuery paymentStatus;
    private final com.evrental.audit.ChangeLog changeLog;
    private final RiderCodes riderCodes;

    public RiderService(RiderRepository riders, AadhaarCipher aadhaarCipher, AssignmentQuery assignmentQuery,
                        RiderPaymentStatusQuery paymentStatus,
                        com.evrental.audit.ChangeLog changeLog,
                        RiderCodes riderCodes) {
        this.riders = riders;
        this.aadhaarCipher = aadhaarCipher;
        this.assignmentQuery = assignmentQuery;
        this.paymentStatus = paymentStatus;
        this.changeLog = changeLog;
        this.riderCodes = riderCodes;
    }

    /**
     * Onboard a rider. The phone is checked before insert so the caller gets a
     * 409 naming the field the form can highlight, rather than a constraint
     * violation naming an index — the same reason VehicleService.create checks
     * the registry id first.
     *
     * <p>depositHeld is the deposit plan: the register holds what a deboard
     * settles against, and what was actually collected is a ledger fact (S6),
     * not a register fact. The four verification flags are stored for audit;
     * they do not drive kycStatus, which stays PENDING.
     *
     * <p>The Aadhaar is stored encrypted at rest (AadhaarCipher, AES-256-GCM,
     * key from the AADHAAR_ENCRYPTION_KEY environment variable). The register
     * never returns it — RiderResponse has no such field.
     */
    @Transactional
    public Rider onboard(OnboardRiderRequest request, UUID tenantId) {
        String phone = request.phone().trim();
        String name = request.name().trim();

        riders.findByPhone(phone).ifPresent(existing -> {
            throw new ConflictException(
                    "A rider with this phone number is already on the register", "phone");
        });
        // The screen derives "deposit pending" as plan minus paid and will not
        // show a negative; the figures arrive separately here, so the same
        // rule has to hold on this side.
        if (request.depositPaid() != null && request.depositPaid() > request.depositPlan()) {
            throw new ValidationException("depositPaid", "Deposit paid cannot be more than the deposit plan");
        }

        Rider rider = new Rider();
        rider.setTenantId(tenantId);
        rider.setRiderCode(riderCodes.next(tenantId));
        rider.setName(name);
        rider.setPhone(phone);
        rider.setStatus(RiderStatus.ACTIVE);
        rider.setKycStatus(KycStatus.PENDING);
        rider.setPlanAmountPaise(request.planAmount());
        rider.setDepositHeldPaise(request.depositPlan());
        rider.setBillingDay(request.billingDay());
        rider.setPaymentDay(request.paymentDay());
        rider.setPaymentMode(request.paymentMode());
        rider.setPlatform(request.workingPlatform().trim());
        rider.setOnboardedOn(request.onboardedOn());
        rider.setAadhaarVerified(request.verification().aadhaarVerified());
        rider.setPrimaryVerified(request.verification().primaryVerified());
        rider.setWhatsappVerified(request.verification().whatsappVerified());
        rider.setAlternate1Verified(request.verification().alternate1Verified());
        rider.setAadhaarEncrypted(aadhaarCipher.encrypt(request.aadhaarNumber()));

        // Steps 1, 3 and 4 of the wizard, which were validated and then
        // dropped. Trimmed and blank-to-null so an untouched optional field
        // is absent rather than an empty string, which reads as "answered
        // with nothing".
        rider.setPermanentAddress(trimmed(request.permanentAddress()));
        rider.setWhatsappNumber(trimmed(request.whatsappNumber()));
        rider.setAlternateNumber1(trimmed(request.alternateNumber1()));
        rider.setLocalAddress(trimmed(request.localAddress()));
        rider.setCity(trimmed(request.city()));
        rider.setStateName(trimmed(request.state()));
        rider.setPinCode(trimmed(request.pinCode()));
        rider.setLocationCoordinates(trimmed(request.locationCoordinates()));
        rider.setPanNumber(trimmed(request.panNumber()));
        rider.setDrivingLicence(trimmed(request.drivingLicence()));
        rider.setPlatformRiderId(trimmed(request.platformRiderId()));
        // Defaults to what they were asked for rather than to zero: a rider
        // onboarded without the field answered has paid the plan, not nothing.
        rider.setDepositPaidPaise(request.depositPaid() == null ? request.depositPlan() : request.depositPaid());
        return riders.save(rider);
    }

    /**
     * The list. vehicleState filters to riders whose current bike is in the
     * given state — the register screen's filter, answered from the open
     * assignments (S5). The filter stays in SQL so pagination counts the
     * filtered set; an empty set short-circuits to an empty page rather than
     * emitting an `in ()` clause.
     */
    public Page<Rider> search(RiderQuery query, Pageable pageable) {
        Set<UUID> riderIds = query.vehicleState() == null
                ? null
                : assignmentQuery.riderIdsWhoseVehicleIsIn(query.vehicleState());
        if (riderIds != null && riderIds.isEmpty()) {
            return Page.empty(pageable);
        }
        return riders.search(
                searchPattern(query.q()),
                query.status(),
                filterValue(query.platform()),
                riderIds,
                pageable);
    }

    /**
     * The facet chips. Counted over the search but never over the status
     * filter, or filtering to ACTIVE would show every other chip at zero and
     * the chips would fight the user — the same rule as vehicle facets.
     */
    public List<Facet<String>> facets(RiderQuery query) {
        Set<UUID> riderIds = query.vehicleState() == null
                ? null
                : assignmentQuery.riderIdsWhoseVehicleIsIn(query.vehicleState());
        if (riderIds != null && riderIds.isEmpty()) {
            return List.of(new Facet<>("ALL", "All", 0));
        }
        String q = searchPattern(query.q());
        String platform = filterValue(query.platform());

        List<Object[]> counts = riders.countByStatus(q, platform, riderIds);
        long total = counts.stream().mapToLong(row -> (Long) row[1]).sum();

        List<Facet<String>> facets = counts.stream()
                .map(row -> new Facet<>(
                        ((RiderStatus) row[0]).name(), ((RiderStatus) row[0]).label(), (Long) row[1]))
                .sorted(Comparator.comparingLong(Facet<String>::count).reversed())
                .toList();

        java.util.ArrayList<Facet<String>> response = new java.util.ArrayList<>();
        response.add(new Facet<>("ALL", "All", total));
        response.addAll(facets);
        return response;
    }

    /**
     * One rider. RLS makes "does not exist" and "exists but is another
     * tenant's" the same thing: the row is invisible, so this 404s.
     */
    public Rider findById(UUID id) {
        return riders.findById(id).orElseThrow(() -> NotFoundException.of("Rider", id));
    }

    /**
     * The door every controller uses now. {@link #findById} stays for the
     * modules that already hold a rider's internal UUID (an assignment row,
     * a charge, a payment period) — this is for callers that only have the
     * code a URL or a form carries.
     */
    public Rider findByRiderCode(String riderCode) {
        return riders.findByRiderCode(riderCode)
                .orElseThrow(() -> NotFoundException.of("Rider", riderCode));
    }

    /**
     * Riders a bike can be assigned to. Deliberately not filtered on KYC —
     * whether a bike may go out to a rider whose documents are still pending
     * is a rule nobody has stated, and guessing "no" would strand every rider
     * the onboarding screen creates. The screen shows the status instead.
     * Holding a bike is the one hard exclusion: one rider, one bike.
     */
    public List<Rider> assignable() {
        Set<UUID> holders = assignmentQuery.riderIdsHoldingBikes();
        return riders.findByStatus(RiderStatus.ACTIVE).stream()
                .filter(r -> !holders.contains(r.getId()))
                .toList();
    }

    /**
     * Riders actually holding a bike — the register's assigned list, answered
     * from the open assignments (S5).
     */
    public List<Rider> assigned() {
        Set<UUID> holders = assignmentQuery.riderIdsHoldingBikes();
        return riders.findByStatus(RiderStatus.ACTIVE).stream()
                .filter(r -> holders.contains(r.getId()))
                .toList();
    }

    /**
     * The wire shape, with currentVehicleId answered from the open assignment.
     * The one mapping the controllers use, so a rider never goes out with a
     * stale or missing bike.
     */
    public RiderResponse toResponse(Rider rider) {
        return RiderResponse.from(rider,
                assignmentQuery.currentVehicleIdOf(rider.getId()),
                paymentStatus.statusFor(List.of(rider.getId())).get(rider.getId()));
    }

    /**
     * The same mapping for a page of riders, reading both derived fields in
     * one batch each.
     *
     * <p>{@link #toResponse} is fine for a single rider and wrong for a list:
     * used per row it issues two queries per row, and the register's list is
     * the most-opened screen in the product.
     */
    public List<RiderResponse> toResponses(List<Rider> page) {
        if (page.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = page.stream().map(Rider::getId).toList();
        Map<UUID, String> vehicles = assignmentQuery.currentVehicleIdsOf(ids);
        Map<UUID, String> statuses = paymentStatus.statusFor(ids);
        return page.stream()
                .map(r -> RiderResponse.from(r, vehicles.get(r.getId()), statuses.get(r.getId())))
                .toList();
    }

    /**
     * The deboard door: the only code that writes DEBOARDED. Called by the
     * assignment module inside the deboard transaction, so the rider's status,
     * the closed assignment and the service job commit together.
     */
    @Transactional
    public Rider markDeboarded(UUID id) {
        Rider rider = findById(id);
        rider.setStatus(RiderStatus.DEBOARDED);
        return riders.save(rider);
    }

    /**
     * Changes a rider's weekly plan.
     *
     * <p>The register had no way to do this at all — the plan was written once
     * at onboarding and the controller's own comment said "no update
     * endpoint". A rider renegotiating their rent meant deboarding and
     * re-onboarding them, which loses their history and their deposit.
     *
     * <p>Deliberately narrow: this changes one number, logs it, and touches
     * nothing else. A general rider-update endpoint would let a name, a phone
     * and a billing day move in one unlogged call.
     *
     * <p>The change does not reach a frozen period. V010 freezes the plan onto
     * each week's row at generation, so a rider's bill for a week already
     * generated stays as it was — which is the entire point of that design.
     */
    @Transactional
    public Rider changePlan(UUID id, long newPlanPaise, String actorName) {
        if (newPlanPaise <= 0) {
            throw new ValidationException("planAmount", OnboardRiderRequest.PLAN_MIN_RULE);
        }
        if (newPlanPaise > OnboardRiderRequest.PLAN_MAX_PAISE) {
            throw new ValidationException("planAmount", OnboardRiderRequest.PLAN_MAX_RULE);
        }
        Rider rider = findById(id);
        changeLog.planChanged(rider.getTenantId(), rider.getId(),
                rider.getPlanAmountPaise(), newPlanPaise, actorName);
        rider.setPlanAmountPaise(newPlanPaise);
        return riders.save(rider);
    }

    /**
     * Records the KYC decision.
     *
     * <p>{@code kycStatus} was written once, at onboarding, as PENDING, and
     * nothing in the codebase could ever change it. Three screens render the
     * chip, so every rider in the register read "KYC pending" for ever — a
     * verification state that could not be reached is worse than no chip,
     * because it looks like a queue somebody is working through.
     *
     * <p>Rejecting is not deleting. A rejected rider stays on the register
     * with the decision recorded against them; taking them off is a deboard,
     * which is a different act with different consequences for the bike.
     */
    @Transactional
    public Rider decideKyc(UUID id, KycStatus decision) {
        if (decision == KycStatus.PENDING) {
            throw new ValidationException("kycStatus",
                    "Pending is where a rider starts, not a decision you can record");
        }
        Rider rider = findById(id);
        rider.setKycStatus(decision);
        return riders.save(rider);
    }

    /**
     * The way back onto the active register.
     *
     * <p>Without it {@link #markDeboarded} is a one-way door: {@link
     * #assignable()} filters on ACTIVE, nothing else writes that status, and
     * the route the deboard's own comment names — "re-activated by the next
     * onboarding" — cannot happen, because {@link #onboard} rejects a second
     * rider on the same phone number. A deboarded rider was therefore
     * permanently unassignable, and the assign screen said "every active rider
     * already has a bike", which was true and no help at all.
     *
     * <p>Reactivating a rider who never left is a no-op rather than an error:
     * the caller's intent is "this rider should be on the register", and they
     * already are.
     *
     * <p>BLACKLISTED is refused. That status is a decision about a person, not
     * a step in the bike's journey, and undoing it through the assign flow
     * would make it meaningless.
     */
    @Transactional
    public Rider reactivate(UUID id) {
        Rider rider = findById(id);
        if (rider.getStatus() == RiderStatus.BLACKLISTED) {
            throw new ConflictException(
                    rider.getName() + " is blacklisted and cannot be put back on the register", "status");
        }
        rider.setStatus(RiderStatus.ACTIVE);
        return riders.save(rider);
    }

    /** A rider with the bikes they have held, for the profile screen. */
    public RiderDetailResponse toDetailResponse(Rider rider) {
        return RiderDetailResponse.from(toResponse(rider), rider, assignmentQuery.historyForRider(rider.getId()));
    }

    /**
     * The frontend sends "ALL" for an unset dropdown, and "" for an empty box.
     * Lowercased here rather than with lower(:param) in the query: these are
     * nullable binds, and Postgres types an untyped null as bytea, so
     * lower(:platform) on an unset filter would fail. Same shape as
     * VehicleService.filterValue.
     */
    private static String filterValue(String raw) {
        return raw == null || raw.isBlank() || "ALL".equals(raw) ? null : raw.trim().toLowerCase();
    }

    private static String searchPattern(String raw) {
        return raw == null || raw.isBlank() ? null : "%" + raw.trim().toLowerCase() + "%";
    }

    /** Blank optional answers are absent, not empty strings. */
    private static String trimmed(String value) {
        if (value == null) {
            return null;
        }
        String t = value.trim();
        return t.isEmpty() ? null : t;
    }
}
