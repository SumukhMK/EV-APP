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
        /** Unpaid rent plus open charges, in paise — the same figure the assign picker weighs against the deposit. */
        long duesPaise,
        String platform,
        PaymentDay paymentDay,
        PaymentMode paymentMode,
        List<RiderAssignmentRow> assignments,
        /**
         * The onboarding answers V012 started keeping.
         *
         * <p>On the detail response only. The list has no use for a rider's
         * PAN, and a register page carrying every rider's address is a lot of
         * wire for a column nobody renders.
         *
         * <p>No Aadhaar here, for the reason RiderResponse states: it is
         * stored encrypted and never returned, not even masked.
         */
        String permanentAddress,
        String whatsappNumber,
        String alternateNumber1,
        String localAddress,
        String city,
        String state,
        String pinCode,
        String locationCoordinates,
        String panNumber,
        String drivingLicence,
        String platformRiderId,
        Long depositPaid) {

    public static RiderDetailResponse from(RiderResponse r, Rider rider,
                                           List<RiderAssignmentRow> assignments) {
        return new RiderDetailResponse(
                r.id(), r.name(), r.phone(), r.status(), r.kycStatus(),
                r.planAmount(), r.depositHeld(), r.billingDay(), r.currentVehicleId(),
                r.onboardedOn(), r.paymentStatus(), r.duesPaise(), r.platform(), r.paymentDay(), r.paymentMode(),
                assignments,
                rider.getPermanentAddress(), rider.getWhatsappNumber(), rider.getAlternateNumber1(),
                rider.getLocalAddress(), rider.getCity(), rider.getStateName(), rider.getPinCode(),
                rider.getLocationCoordinates(), rider.getPanNumber(), rider.getDrivingLicence(),
                rider.getPlatformRiderId(), rider.getDepositPaidPaise());
    }
}
