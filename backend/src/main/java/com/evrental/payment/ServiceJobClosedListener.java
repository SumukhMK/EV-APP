package com.evrental.payment;

import com.evrental.service.ServiceJobClosedEvent;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * The seam between the workshop and the money.
 *
 * <p>The service module publishes {@link ServiceJobClosedEvent} and knows
 * nothing about charges; this listens and knows nothing about queues or QC.
 * That is the whole coupling between S4 and S6, and it points one way.
 *
 * <p><strong>AFTER_COMMIT, not during.</strong> A charge raised inside the
 * closing transaction would survive a rollback of the close that caused it —
 * the rider billed for a repair the system then decided had not happened.
 * Waiting for the commit means the charge only ever follows a close that
 * really stuck.
 *
 * <p><strong>@Async, so a slow ledger never holds up a workshop.</strong> The
 * operator has already released the bike; the charge is read days later at the
 * payment run. The trade is that delivery is best-effort — which is why
 * raising the charge is idempotent, guarded by a unique index on the job id.
 * AsyncConfig logs anything this throws rather than dropping it silently.
 */
@Component
public class ServiceJobClosedListener {

    private final RiderChargeService charges;

    public ServiceJobClosedListener(RiderChargeService charges) {
        this.charges = charges;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onServiceJobClosed(ServiceJobClosedEvent event) {
        charges.raiseFor(event);
    }
}
