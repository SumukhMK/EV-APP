package com.evrental.payment;

import com.evrental.service.ServiceLiability;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One charge, as the ledger reads it.
 *
 * <p>Mirrors RiderCharge in frontend/app/src/types/payment.ts, including
 * {@code periodStart} — the billing period the charge first appears against.
 * V007 had no such column and this record had no such field, because the
 * period depends on the rider's billing day and riders were S2. Both arrived
 * with V009.
 *
 * <p>{@code riderId} is the rider code an operator reads ("R01"), not the
 * register's internal row id.
 */
public record RiderChargeResponse(
        UUID id,
        String riderId,
        UUID serviceJobId,
        UUID vehicleId,
        long amountPaise,
        ServiceLiability liability,
        RiderChargeStatus status,
        LocalDate periodStart,
        Instant chargedOn,
        Instant settledOn) {

    public static RiderChargeResponse from(RiderCharge charge, String riderCode) {
        return new RiderChargeResponse(
                charge.getId(), riderCode, charge.getServiceJobId(), charge.getVehicleId(),
                charge.getAmountPaise(), charge.getLiability(), charge.getStatus(),
                charge.getPeriodStart(), charge.getChargedOn(), charge.getSettledOn());
    }
}
