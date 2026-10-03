package com.evrental.rider;

import com.evrental.assignment.RiderAssignmentRow;
import java.util.List;

/**
 * A rider plus the bikes they have held.
 *
 * <p>The mirror of {@code VehicleDetailResponse}, which has carried its
 * assignment history since S5. The rider side had none, so a bike that went
 * back was readable from the bike's page and invisible from the person's —
 * deboard a rider and their profile said only "this rider is deboarded and
 * cannot hold a bike", never naming what they had just returned.
 *
 * <p>The list is an empty array rather than absent for a rider who has never
 * held one, so the screen renders an empty panel instead of branching.
 */
public record RiderDetailResponse(
        String id,
        String name,
        String phone,
        RiderStatus status,
        KycStatus kycStatus,
        long planAmount,
        long depositHeld,
        BillingDay billingDay,
        String currentVehicleId,
        java.time.LocalDate onboardedOn,
        String paymentStatus,
        String platform,
        PaymentDay paymentDay,
        PaymentMode paymentMode,
        List<RiderAssignmentRow> assignments) {

    public static RiderDetailResponse from(RiderResponse r, List<RiderAssignmentRow> assignments) {
        return new RiderDetailResponse(
                r.id(), r.name(), r.phone(), r.status(), r.kycStatus(),
                r.planAmount(), r.depositHeld(), r.billingDay(), r.currentVehicleId(),
                r.onboardedOn(), r.paymentStatus(), r.platform(), r.paymentDay(), r.paymentMode(),
                assignments);
    }
}
