package com.evrental.rider;

import com.evrental.common.AadhaarCipher;
import com.evrental.common.ConflictException;
import com.evrental.common.Facet;
import com.evrental.common.NotFoundException;
import com.evrental.common.PageResponse;
import java.util.Comparator;
import java.util.List;
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
 */
@Service
public class RiderService {

    private final RiderRepository riders;
    private final AadhaarCipher aadhaarCipher;

    public RiderService(RiderRepository riders, AadhaarCipher aadhaarCipher) {
        this.riders = riders;
        this.aadhaarCipher = aadhaarCipher;
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
     * The list. vehicleState is accepted for contract parity but matches
     * nothing until S5 owns assignments: no rider holds a bike, so a rider
     * whose vehicle is in a given state does not exist. An empty page is the
     * honest answer — the mock's filter would also match nothing if no rider
     * had a bike.
     */
    public Page<Rider> search(RiderQuery query, Pageable pageable) {
        if (query.vehicleState() != null) {
            return Page.empty(pageable);
        }
        return riders.search(
                searchPattern(query.q()),
                query.status(),
                filterValue(query.platform()),
                pageable);
    }

    /**
     * The facet chips. Counted over the search but never over the status
     * filter, or filtering to ACTIVE would show every other chip at zero and
     * the chips would fight the user — the same rule as vehicle facets.
     */
    public List<Facet<String>> facets(RiderQuery query) {
        if (query.vehicleState() != null) {
            return List.of(new Facet<>("ALL", "All", 0));
        }
        String q = searchPattern(query.q());
        String platform = filterValue(query.platform());

        List<Object[]> counts = riders.countByStatus(q, platform);
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
     */
    public List<Rider> assignable() {
        return riders.findByStatus(RiderStatus.ACTIVE);
    }

    /**
     * Riders actually holding a bike. Empty until S5 owns assignments — the
     * register does not store currentVehicleId, so this cannot be answered
     * from here, and answering it from the assignment table is S5's job.
     */
    public List<Rider> assigned() {
        return List.of();
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