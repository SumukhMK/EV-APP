package com.evrental.payment;

import com.evrental.rider.Rider;
import com.evrental.rider.RiderRepository;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * What approving a settlement writes to the ledger.
 *
 * <p>Lives in {@code payment/} because it writes money, and is called by
 * {@code assignment/} through this one method — the same shape as
 * {@code ServiceJobFacade.openJob()}: one signature wide, and a change to it
 * is a conversation.
 *
 * <p>Two facts, two records, deliberately not netted. Rent owed is a charge
 * on the ledger; the refund draws the rider's held deposit down. Netting them
 * into one figure would lose which part was rent and which was deposit, and
 * that is exactly what gets argued about six weeks later.
 */
@Component
public class SettlementLedger {

    private final RiderChargeRepository charges;
    private final RiderRepository riders;
    private final BillingClock clock;

    public SettlementLedger(RiderChargeRepository charges, RiderRepository riders, BillingClock clock) {
        this.charges = charges;
        this.riders = riders;
        this.clock = clock;
    }

    /**
     * @return the id of the charge raised for outstanding rent, or null when
     *         there was none to raise. Returned so the assignment row can name
     *         the entry it produced and refuse to approve twice.
     */
    @Transactional
    public UUID settle(UUID tenantId, UUID riderId, long outstandingRentPaise, long depositRefundPaise) {
        UUID chargeId = null;

        if (outstandingRentPaise > 0) {
            RiderCharge charge = new RiderCharge();
            charge.setTenantId(tenantId);
            charge.setRiderId(riderId);
            // No service job and no vehicle: this is rent, not a repair. V014
            // made both nullable for exactly this row.
            charge.setAmountPaise(outstandingRentPaise);
            // RIDER, not DEPOSIT: unpaid rent is money the rider owes. Billing
            // it against the deposit would quietly spend the refund being
            // handed back in the same breath.
            charge.setLiability(com.evrental.service.ServiceLiability.RIDER);
            // chargedOn is a @CreationTimestamp; the row stamps itself.
            charge.setPeriodStart(periodStartFor(riderId));
            chargeId = charges.save(charge).getId();
        }

        if (depositRefundPaise > 0) {
            Rider rider = riders.findById(riderId).orElse(null);
            if (rider != null) {
                // Floored at zero rather than allowed negative: a refund
                // larger than the balance is a data problem, and a negative
                // deposit would spread it silently into every later run.
                long remaining = Math.max(0, rider.getDepositHeldPaise() - depositRefundPaise);
                rider.setDepositHeldPaise(remaining);
                riders.save(rider);
            }
        }

        return chargeId;
    }

    /**
     * The billing period this charge first appears against.
     *
     * <p>A settlement is raised the day it is approved, so it belongs to the
     * week that is open then — the same rule V010 applies to every other
     * charge.
     */
    private LocalDate periodStartFor(UUID riderId) {
        LocalDate today = clock.today();
        return riders.findById(riderId)
                .map(r -> BillingPeriod.startOnOrBefore(r.getBillingDay(), today))
                .orElse(today);
    }
}
