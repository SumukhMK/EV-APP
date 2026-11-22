package com.evrental.payment;

import com.evrental.rider.Rider;
import com.evrental.rider.RiderPaymentStatusQuery;
import com.evrental.rider.RiderRepository;
import java.time.LocalDate;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The money module's answer to the register's question, read off the same
 * {@link RiderAccounts} account as the payment run, so the register's chip and
 * dues cannot disagree with the run, the receipt or the overdue list.
 *
 * <p>A rider with no tenancy and nothing open is absent: never billed is not
 * the same as owing.
 */
@Component
public class RiderPaymentStatus implements RiderPaymentStatusQuery {

    private final RiderRepository riders;
    private final RiderAccounts accounts;
    private final BillingClock clock;

    public RiderPaymentStatus(RiderRepository riders, RiderAccounts accounts, BillingClock clock) {
        this.riders = riders;
        this.accounts = accounts;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, Long> owedPaiseFor(Collection<UUID> riderIds) {
        Map<UUID, Long> owed = new LinkedHashMap<>();
        forEachAccount(riderIds, (rider, a) -> {
            if (a.owed() > 0) owed.put(rider.getId(), a.owed());
        });
        return owed;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, String> statusFor(Collection<UUID> riderIds) {
        Map<UUID, String> byRider = new LinkedHashMap<>();
        forEachAccount(riderIds, (rider, a) -> {
            if (a.since() != null || a.owed() > 0) byRider.put(rider.getId(), a.status().name());
        });
        return byRider;
    }

    private void forEachAccount(Collection<UUID> riderIds, BiConsumer<Rider, RiderAccounts.Account> each) {
        if (riderIds.isEmpty()) {
            return;
        }
        LocalDate today = clock.today();
        for (Rider rider : riders.findAllById(riderIds)) {
            each.accept(rider, accounts.of(rider, today));
        }
    }
}
