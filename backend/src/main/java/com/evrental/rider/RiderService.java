package com.evrental.rider;

import com.evrental.assignment.AssignmentQuery;
import com.evrental.common.AadhaarCipher;
import com.evrental.common.ConflictException;
import com.evrental.common.Facet;
import com.evrental.common.NotFoundException;
import com.evrental.common.PageResponse;
import java.util.Comparator;
import java.util.List;
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

    public RiderService(RiderRepository riders, AadhaarCipher aadhaarCipher, AssignmentQuery assignmentQuery) {
        this.riders = riders;
        this.aadhaarCipher = aadhaarCipher;
        this.assignmentQuery = assignmentQuery;
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

        Rider rider = new Rider();
        rider.setTenantId(tenantId);
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
        return RiderResponse.from(rider, assignmentQuery.currentVehicleIdOf(rider.getId()));
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
}