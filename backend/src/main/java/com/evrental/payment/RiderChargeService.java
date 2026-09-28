package com.evrental.payment;

import com.evrental.service.ServiceJobClosedEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The charge ledger.
 *
 * <p>Half of S6. A closed service job whose cost falls on the rider becomes a
 * row here; the weekly run, the overdue list and receipts are the other half
 * and wait on S2, because every one of them needs the rider's name, rent and
 * billing day.
 */
@Service
public class RiderChargeService {

    private static final Logger log = LoggerFactory.getLogger(RiderChargeService.class);

    private final RiderChargeRepository charges;
    private final JdbcTemplate jdbc;

    public RiderChargeService(RiderChargeRepository charges, JdbcTemplate jdbc) {
        this.charges = charges;
        this.jdbc = jdbc;
    }

    /**
     * Raises the charge a closed job owes, once and only once.
     *
     * <p>REQUIRES_NEW because the transaction that closed the job has already
     * committed by the time this runs — that is the point of listening after
     * commit rather than inside it. This needs a transaction of its own or
     * there is nothing for {@code SET LOCAL} to be local to.
     *
     * @return the charge, or null when there was nothing to raise
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public RiderCharge raiseFor(ServiceJobClosedEvent event) {
        // No request, so no TenantFilter, so nothing has told Postgres who we
        // are -- and row-level security would refuse the insert. The event
        // carries the tenant precisely so this thread can say.
        jdbc.queryForObject("SELECT set_config('app.tenant_id', ?, true)",
                String.class, event.tenantId().toString());

        if (!event.liability().raisesCharge()) {
            return null;
        }
        if (event.riderId() == null) {
            // Nobody to bill. The service refuses this at close time, so
            // reaching here means a job closed before that rule existed.
            log.warn("Service job {} closed as {} with no rider; no charge raised",
                    event.jobId(), event.liability());
            return null;
        }
        if (event.totalCostPaise() <= 0) {
            // A repair that cost nothing is not a debt, and the database's
            // amount > 0 check would refuse the row anyway.
            return null;
        }
        // The ordinary way a replay is handled: a plain read, before anything
        // has gone wrong, so the caller gets the charge that already exists.
        // The unique index below is the guarantee; this is the path that gives
        // a useful answer rather than just refusing.
        var existing = charges.findByServiceJobId(event.jobId());
        if (existing.isPresent()) {
            log.info("Job {} already has a charge; nothing raised", event.jobId());
            return existing.get();
        }

        RiderCharge charge = new RiderCharge();
        charge.setTenantId(event.tenantId());
        charge.setRiderId(event.riderId());
        charge.setServiceJobId(event.jobId());
        charge.setVehicleId(event.vehicleId());
        charge.setAmountPaise(event.totalCostPaise());
        charge.setLiability(event.liability());

        try {
            RiderCharge saved = charges.saveAndFlush(charge);
            log.info("Raised {} charge of {} paise against rider {} for job {}",
                    charge.getLiability(), charge.getAmountPaise(), event.riderId(), event.jobId());
            return saved;
        } catch (DataIntegrityViolationException e) {
            // idx_rc_one_per_job, hit by two deliveries racing: the read above
            // found nothing and another thread inserted before this one did.
            //
            // Nothing is read here on the way out, deliberately. The failed
            // insert has already aborted this transaction at the Postgres
            // level, so any further statement on it comes back "current
            // transaction is aborted" -- the lookup would fail rather than
            // return the row it was reaching for. The rider is correctly
            // billed once, which is what matters; the caller gets null and
            // the charge is one query away.
            log.info("Job {} was charged by another delivery; nothing raised", event.jobId());
            return null;
        }
    }

    /**
     * Marks a charge paid, or drawn from the deposit.
     *
     * <p>One way only. Money rows are never edited, so there is no unsettle:
     * a refund or a mistake is a new row, which is the rule that keeps a
     * ledger worth reading.
     */
    @Transactional
    public RiderCharge settle(UUID chargeId) {
        RiderCharge charge = charges.findById(chargeId)
                .orElseThrow(() -> com.evrental.common.NotFoundException.of("Charge", chargeId));
        if (charge.getStatus() == RiderChargeStatus.SETTLED) {
            throw new com.evrental.common.ConflictException("This charge is already settled");
        }
        charge.settle(Instant.now());
        return charges.save(charge);
    }

    @Transactional(readOnly = true)
    public List<RiderCharge> forRider(UUID riderId, RiderChargeStatus status) {
        return status == null
                ? charges.findByRiderIdOrderByChargedOnDesc(riderId)
                : charges.findByRiderIdAndStatusOrderByChargedOnDesc(riderId, status);
    }

    /**
     * What a rider owes right now.
     *
     * <p>DEPOSIT charges are counted here even though they never appear on a
     * weekly run: the money is owed either way, it just comes out of what is
     * already held rather than being billed. The run is where the two are
     * told apart, and the run is S2's to unblock.
     */
    @Transactional(readOnly = true)
    public long outstandingPaiseFor(UUID riderId) {
        return charges.findByRiderIdAndStatusOrderByChargedOnDesc(riderId, RiderChargeStatus.OPEN)
                .stream()
                .mapToLong(RiderCharge::getAmountPaise)
                .sum();
    }
}
