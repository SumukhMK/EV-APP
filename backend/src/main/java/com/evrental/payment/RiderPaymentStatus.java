package com.evrental.payment;

import com.evrental.rider.RiderPaymentStatusQuery;
import java.time.LocalDate;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The money module's answer to the register's question.
 *
 * <p>A rider's standing is the status of their most recent billing period.
 * Not an aggregate over all of them: an operator looking at the register
 * wants to know where this rider is now, and a week settled in August should
 * not colour the chip for a week that is unpaid today.
 *
 * <p>The status is computed from the numbers rather than read from the stored
 * column, for the reason {@code PaymentRunService.overdue()} documents at
 * length: nothing writes to a period row between the day it is generated and
 * the day it quietly goes overdue, so the stored enum lags reality. Unlike
 * that method this one does not write the correction back — the register is a
 * reader, and a list screen is the wrong place to be repairing the ledger.
 */
@Component
public class RiderPaymentStatus implements RiderPaymentStatusQuery {

    private final PaymentPeriodRepository periods;
    private final RiderChargeRepository charges;
    private final BillingClock clock;

    public RiderPaymentStatus(PaymentPeriodRepository periods, RiderChargeRepository charges, BillingClock clock) {
        this.periods = periods;
        this.charges = charges;
        this.clock = clock;
    }

    /**
     * Rent still unpaid on any period, plus every open charge. A period paid
     * ahead (negative balance) does not offset another period's debt here:
     * the credit is real, but netting it against a repair charge is a
     * decision for the desk, not for a number on a picker.
     */
    @Override
    @Transactional(readOnly = true)
    public Map<UUID, Long> owedPaiseFor(Collection<UUID> riderIds) {
        if (riderIds.isEmpty()) {
            return Map.of();
        }
        List<UUID> ids = List.copyOf(riderIds);
        Map<UUID, Long> owed = new LinkedHashMap<>();
        for (PaymentPeriod row : periods.findByRiderIdInOrderByPeriodStartDesc(ids)) {
            long balance = row.balancePaise();
            if (balance > 0) {
                owed.merge(row.getRiderId(), balance, Long::sum);
            }
        }
        for (RiderCharge charge : charges.findByRiderIdInAndStatus(ids, RiderChargeStatus.OPEN)) {
            owed.merge(charge.getRiderId(), charge.getAmountPaise(), Long::sum);
        }
        return owed;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, String> statusFor(Collection<UUID> riderIds) {
        if (riderIds.isEmpty()) {
            return Map.of();
        }
        LocalDate today = clock.today();
        List<PaymentPeriod> rows = periods.findByRiderIdInOrderByPeriodStartDesc(List.copyOf(riderIds));

        Map<UUID, String> byRider = new LinkedHashMap<>();
        for (PaymentPeriod row : rows) {
            // Newest first, so the first row seen for a rider is their current
            // one and later rows are history.
            byRider.computeIfAbsent(row.getRiderId(), id -> statusOf(row, today));
        }
        return byRider;
    }

    /** The same four-way rule {@link PaymentPeriod#recomputeStatus} applies, without the write. */
    private static String statusOf(PaymentPeriod row, LocalDate today) {
        if (row.getAmountPaidPaise() >= row.getTotalDuePaise()) {
            return PaymentStatus.PAID.name();
        }
        if (today.isAfter(row.getPeriodEnd())) {
            return PaymentStatus.OVERDUE.name();
        }
        if (row.getAmountPaidPaise() > 0) {
            return PaymentStatus.PARTIAL.name();
        }
        return PaymentStatus.PENDING.name();
    }
}
