package com.evrental.rider;

import java.time.LocalDate;

/**
 * The wire shape of a rider, mirroring Rider in frontend/app/src/types/rider.ts
 * field for field.
 *
 * <p>currentVehicleId is a property of the open assignment, which S5 owns, and
 * the register does not store it — the caller (RiderService.toResponse)
 * answers it from the assignment module and passes it in. paymentStatus is
 * always "PENDING": it is derived from the current billing period, which S6's
 * second half computes.
 *
 * <p>There is no aadhaar field, on purpose. The register stores the number
 * encrypted at rest (AadhaarCipher) but never returns it — not even masked —
 * so the wire cannot leak it.
 */
public record RiderResponse(
        String id,
        String name,
        String phone,
        RiderStatus status,
        KycStatus kycStatus,
        long planAmount,
        long depositHeld,
        BillingDay billingDay,
        String currentVehicleId,
        LocalDate onboardedOn,
        String paymentStatus,
        /** Unpaid rent plus open charges, in paise. What the desk weighs against the deposit before a bike goes out. */
        long duesPaise,
        String platform,
        PaymentDay paymentDay,
        PaymentMode paymentMode) {

    /** The registry id of the bike this rider holds, or null. */
    public static RiderResponse from(Rider r, String currentVehicleId) {
        return from(r, currentVehicleId, null);
    }

    /**
     * @param paymentStatus the rider's current standing from the money module,
     *                      or null when they have never been billed. This used
     *                      to be the literal "PENDING" for every rider ever
     *                      returned, which put a chip on three screens saying
     *                      the same word regardless of what the ledger held.
     */
    public static RiderResponse from(Rider r, String currentVehicleId, String paymentStatus) {
        return from(r, currentVehicleId, paymentStatus, 0L);
    }

    public static RiderResponse from(Rider r, String currentVehicleId, String paymentStatus, long duesPaise) {
        return new RiderResponse(
                r.getRiderCode(),
                r.getName(),
                r.getPhone(),
                r.getStatus(),
                r.getKycStatus(),
                r.getPlanAmountPaise(),
                r.getDepositHeldPaise(),
                r.getBillingDay(),
                currentVehicleId,
                r.getOnboardedOn(),
                paymentStatus == null ? "PENDING" : paymentStatus,
                duesPaise,
                r.getPlatform(),
                r.getPaymentDay(),
                r.getPaymentMode());
    }

    /** A rider with no bike. Kept for the create path, where no assignment exists yet. */
    public static RiderResponse from(Rider r) {
        return from(r, null);
    }
}