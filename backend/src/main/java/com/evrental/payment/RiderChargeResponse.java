package com.evrental.payment;

import com.evrental.service.ServiceLiability;
import java.time.Instant;
import java.util.UUID;

/**
 * One charge, as the ledger reads it.
 *
 * <p>Close to RiderCharge in frontend/app/src/types/payment.ts, with one
 * field deliberately absent: `periodStart`. Which billing period a charge
 * first appears against depends on the rider's billing day, and riders are
 * S2. `chargedOn` is what actually happened; the period is derived from it
 * when the run is built.
 */
public record RiderChargeResponse(
        UUID id,
        UUID riderId,
        UUID serviceJobId,
        UUID vehicleId,
        long amountPaise,
        ServiceLiability liability,
        RiderChargeStatus status,
        Instant chargedOn,
        Instant settledOn) {

    public static RiderChargeResponse from(RiderCharge charge) {
        return new RiderChargeResponse(
                charge.getId(), charge.getRiderId(), charge.getServiceJobId(), charge.getVehicleId(),
                charge.getAmountPaise(), charge.getLiability(), charge.getStatus(),
                charge.getChargedOn(), charge.getSettledOn());
    }
}
