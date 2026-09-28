package com.evrental.rider;

import java.time.LocalDate;

/**
 * The wire shape of a rider, mirroring Rider in frontend/app/src/types/rider.ts
 * field for field.
 *
 * <p>currentVehicleId is deliberately always null: a rider's bike is a
 * property of the open assignment, which S5 owns, and the register does not
 * store it. paymentStatus is always "PENDING": it is derived from the current
 * billing period, which S6's second half computes.
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
        String platform,
        PaymentDay paymentDay,
        PaymentMode paymentMode) {

    public static RiderResponse from(Rider r) {
        return new RiderResponse(
                r.getId().toString(),
                r.getName(),
                r.getPhone(),
                r.getStatus(),
                r.getKycStatus(),
                r.getPlanAmountPaise(),
                r.getDepositHeldPaise(),
                r.getBillingDay(),
                null,
                r.getOnboardedOn(),
                "PENDING",
                r.getPlatform(),
                r.getPaymentDay(),
                r.getPaymentMode());
    }
}