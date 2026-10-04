package com.evrental.payment;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import com.evrental.rider.BillingDay;
import com.evrental.rider.Rider;
import com.evrental.rider.RiderRepository;
import com.evrental.rider.RiderStatus;
import com.evrental.service.ServiceLiability;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The weekly payment run, collections, receipts and the overdue list.
 *
 * <p>The second half of S6, and the one sentence that explains the shape of
 * all of it: <b>the snapshot freezes what is owed, collections record what came
 * in, and status is a function of the two.</b> The mock derives every screen
 * from the riders on each read, which means raising a rider's weekly plan
 * silently rewrites a receipt printed six weeks ago. Acceptable for a fixture;
 * not for money.
 *
 * <p><b>Generation happens on read.</b> There is no scheduler: the API runs on
 * Render's free plan and spins down after roughly fifteen minutes idle, so a
 * job firing at 00:00 on Monday would land on a sleeping service and quietly
 * not run — observed on 2026-09-28, when a health check timed out at 90s while
 * the service woke. Moving to Starter would make a scheduler an option; it is
 * not one today. The cost of the trade is stated plainly: a period nobody
 * opens does not exist yet.
 */
@Service
public class PaymentRunService {

    private static final Logger log = LoggerFactory.getLogger(PaymentRunService.class);

    /** Only RIDER liability is ever billed; a DEPOSIT charge is drawn from what is held. */
    private static final ServiceLiability BILLABLE = ServiceLiability.RIDER;

    private final PaymentPeriodRepository periods;
    private final PaymentCollectionRepository collections;
    private final RiderChargeRepository charges;
    private final RiderRepository riders;
    private final VehicleRepository vehicles;
    private final AssignmentQuery assignments;
    private final ReceiptNumbers receiptNumbers;
    private final BillingClock clock;

    /**
     * Days past the end of a week before a rider is chased.
     *
     * <p>Three is this operator's rule, not a fact about fleets, so it is
     * configuration rather than a constant. It decides one thing — whether a
     * row is flagged on the run and the overdue list — and deliberately does
     * not touch {@link DunningStage}, whose 7/14/21 ladder is a separate
     * escalation the screens already use.
     */
    private final int graceDays;
    private final JdbcTemplate jdbc;

    public PaymentRunService(PaymentPeriodRepository periods,
                             PaymentCollectionRepository collections,
                             RiderChargeRepository charges,
                             RiderRepository riders,
                             VehicleRepository vehicles,
                             AssignmentQuery assignments,
                             ReceiptNumbers receiptNumbers,
                             BillingClock clock,
                             JdbcTemplate jdbc,
                              @org.springframework.beans.factory.annotation.Value("${app.payment.grace-days:3}") int graceDays) {
        this.periods = periods;
        this.collections = collections;
        this.charges = charges;
        this.riders = riders;
        this.vehicles = vehicles;
        this.assignments = assignments;
        this.receiptNumbers = receiptNumbers;
        this.clock = clock;
        this.graceDays = graceDays;
        this.jdbc = jdbc;
    }

    // -----------------------------------------------------------------------
    // The run (screen 15)
    // -----------------------------------------------------------------------

    /**
     * This week's run for one cycle, generating the rows if nobody has yet.
     *
     * <p>No {@code periodStart} parameter, because the frontend contract's
     * {@code getCurrentPaymentRun} has none: "current" is the most recent
     * occurrence of the billing day on or before today. Older periods are
     * reachable through the rider history panel that already exists.
     */
    @Transactional
    public PaymentRunResponse currentRun(UUID tenantId, BillingDay billingDay) {
        LocalDate today = clock.today();
        BillingPeriod period = BillingPeriod.current(billingDay, today);

        generate(tenantId, period, today);

        List<PaymentPeriod> rows =
                periods.findByPeriodStartAndBillingDayOrderByRiderIdAsc(period.start(), billingDay);
        rows.forEach(row -> row.recomputeStatus(today));

        Map<UUID, Rider> riderById = ridersFor(rows.stream().map(PaymentPeriod::getRiderId).toList());
        Map<UUID, String> registryById = registryIdsFor(rows);

        List<PaymentPeriodRowResponse> body = rows.stream()
                .map(row -> PaymentPeriodRowResponse.from(row, codeOf(riderById, row.getRiderId()),
                        nameOf(riderById, row.getRiderId()),
                        registryById.get(row.getVehicleId()), today, graceDays))
                .sorted(Comparator.comparing(PaymentPeriodRowResponse::riderName,
                        Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)))
                .toList();

        return new PaymentRunResponse(period.start(), period.end(), billingDay, body);
    }

    /**
     * Writes the missing rows for a period, once.
     *
     * <p>Every insert is {@code ON CONFLICT DO NOTHING} against
     * {@code idx_pp_rider_period}, so two people opening this screen in the
     * same second produce one set of rows rather than two bills. The
     * pre-check below is only there to skip the arithmetic for riders who
     * already have a row; the index is the actual guarantee.
     */
    private void generate(UUID tenantId, BillingPeriod period, LocalDate today) {
        List<Rider> cycle = riders.findByStatus(RiderStatus.ACTIVE).stream()
                .filter(r -> r.getBillingDay() == period.billingDay())
                // Sorted by id so two concurrent generations insert in the
                // same order. Without it each one takes row locks in whatever
                // order the register happened to come back in, and two of them
                // can end up waiting on each other's rider.
                .sorted(Comparator.comparing(Rider::getId))
                .toList();
        if (cycle.isEmpty()) {
            return;
        }

        Set<UUID> alreadyBilled = periods
                .findByPeriodStartAndBillingDayOrderByRiderIdAsc(period.start(), period.billingDay())
                .stream()
                .map(PaymentPeriod::getRiderId)
                .collect(Collectors.toSet());

        int written = 0;
        for (Rider rider : cycle) {
            if (alreadyBilled.contains(rider.getId())) {
                continue;
            }
            written += insert(freeze(tenantId, rider, period, today));
        }
        if (written > 0) {
            log.info("Generated {} payment period rows for {} {}", written,
                    period.billingDay(), period.start());
        }
    }

    /**
     * The calculation, done once and then never again for this row.
     *
     * <p>Three rules live here and all three are easy to get wrong:
     *
     * <ul>
     *   <li><b>A full week bills the plan exactly.</b>
     *       {@code round(199900 / 7) * 7} is ₹1,999.05, not ₹1,999. The mock
     *       carries that drift; the designed rows on artboard 15 do not. So
     *       seven days bills {@code planAmount} and proration applies only
     *       below seven — otherwise every rider is quietly overcharged four
     *       paise a week, forever.</li>
     *   <li><b>DEPOSIT charges never reach a run.</b> They are settled against
     *       the deposit, not billed; the contract says so outright.</li>
     *   <li><b>A rider with no plan still gets a row</b>, billing nothing. A
     *       run that silently omits people is how somebody stops being billed
     *       by accident.</li>
     * </ul>
     */
    private PaymentPeriod freeze(UUID tenantId, Rider rider, BillingPeriod period, LocalDate today) {
        long plan = rider.getPlanAmountPaise();
        long perDay = Math.round(plan / (double) period.lengthDays());

        Optional<AssignmentQuery.Window> window =
                assignments.openAssignmentFor(rider.getId(), period.start(), period.end());

        // No overlapping assignment now means what it says: the rider held no
        // bike this week, so there is no rent to charge.
        //
        // This used to fall back to a full week, and had to: AssignmentQuery
        // was answered by NoAssignmentsYet, which returned empty for everyone,
        // so treating empty as "no bike" would have billed the entire register
        // nothing. The fallback was the documented compromise — right
        // arithmetic, absent attribution — and it quietly survived S5, because
        // the assignment module published a different interface of the same
        // name and nobody noticed the contract was still unimplemented.
        //
        // With a real implementation behind it, empty is a fact rather than a
        // gap, and billing a week of rent for a bike the rider did not have is
        // the wrong answer. The row still exists and reads zero; a run that
        // silently omits people is how somebody stops being billed by accident.
        int daysBilled = window
                .map(w -> period.overlapDays(w.startedOn(), w.endedOn()))
                .orElse(0);
        UUID vehicleId = window.map(AssignmentQuery.Window::vehicleId).orElse(null);

        // No plan, nothing to bill. The row still exists, and reads zero.
        if (plan == 0) {
            daysBilled = 0;
        }

        long billed = daysBilled == period.lengthDays() ? plan : perDay * daysBilled;
        long serviceCharges = charges.sumOpenInPeriod(rider.getId(), period.start(), BILLABLE);
        long arrears = charges.sumOpenBefore(rider.getId(), period.start(), BILLABLE);

        PaymentPeriod row = new PaymentPeriod();
        row.setTenantId(tenantId);
        row.setRiderId(rider.getId());
        row.setPeriodStart(period.start());
        row.setPeriodEnd(period.end());
        row.setBillingDay(period.billingDay());
        row.setVehicleId(vehicleId);
        row.setPlanAmountPaise(plan);
        row.setDaysBilled(daysBilled);
        row.setPerDayAmountPaise(perDay);
        row.setBilledAmountPaise(billed);
        row.setServiceChargesPaise(serviceCharges);
        row.setArrearsPaise(arrears);
        row.setTotalDuePaise(billed + serviceCharges + arrears);
        row.recomputeStatus(today);
        return row;
    }

    /**
     * Inserted through JDBC rather than JPA for one reason: {@code ON CONFLICT
     * DO NOTHING}. JPA has no way to express it, and the alternative — catch
     * the constraint violation — aborts the surrounding transaction in
     * Postgres, taking every other rider in the run down with it.
     *
     * @return 1 if this call wrote the row, 0 if another one got there first
     */
    private int insert(PaymentPeriod row) {
        return jdbc.update("""
                INSERT INTO payment_periods (
                    tenant_id, rider_id, period_start, period_end, billing_day, vehicle_id,
                    plan_amount_paise, days_billed, per_day_amount_paise, billed_amount_paise,
                    service_charges_paise, arrears_paise, total_due_paise, amount_paid_paise, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT (tenant_id, rider_id, period_start) DO NOTHING
                """,
                row.getTenantId(), row.getRiderId(), row.getPeriodStart(), row.getPeriodEnd(),
                row.getBillingDay().name(), row.getVehicleId(),
                row.getPlanAmountPaise(), row.getDaysBilled(), row.getPerDayAmountPaise(),
                row.getBilledAmountPaise(), row.getServiceChargesPaise(), row.getArrearsPaise(),
                row.getTotalDuePaise(), row.getStatus().name());
    }

    // -----------------------------------------------------------------------
    // Overdue (screen 17)
    // -----------------------------------------------------------------------

    /**
     * Every rider whose week closed while still short, worst first.
     *
     * <p>Read off the numbers rather than the stored {@code status}: without a
     * scheduler, nothing writes to a row between generation and the day it
     * goes overdue, so trusting the enum would miss every one of them. The
     * statuses are brought back into line here as a side effect, which is why
     * this is not a read-only transaction.
     */
    @Transactional
    public List<OverdueRiderResponse> overdue() {
        LocalDate today = clock.today();
        List<PaymentPeriod> late = periods.findOverdue(today);
        late.forEach(row -> row.recomputeStatus(today));

        Map<UUID, Rider> riderById = ridersFor(late.stream().map(PaymentPeriod::getRiderId).toList());
        Map<UUID, String> registryById = registryIdsFor(late);

        return late.stream()
                .map(row -> {
                    Rider rider = riderById.get(row.getRiderId());
                    long days = row.daysOverdue(today);
                    return new OverdueRiderResponse(
                            rider == null ? null : rider.getRiderCode(),
                            rider == null ? null : rider.getName(),
                            rider == null ? null : rider.getPhone(),
                            registryById.get(row.getVehicleId()),
                            days,
                            row.balancePaise(),
                            DunningStage.forDays(days),
                            days > graceDays);
                })
                .sorted(Comparator.comparingLong(OverdueRiderResponse::daysOverdue).reversed())
                .toList();
    }

    // -----------------------------------------------------------------------
    // Receipts (screen 16)
    // -----------------------------------------------------------------------

    /**
     * One rider's receipt for the current period.
     *
     * <p>Null when the rider has no line in this period — the screen turns
     * that into "no line in this period" rather than inventing one. An unknown
     * rider is a 404, which is a different answer to a different question.
     *
     * <p>The receipt restates the run row; it does not recompute it. Both read
     * the same frozen columns, so the total on the run and the total on the
     * receipt cannot disagree.
     */
    @Transactional
    public PaymentReceiptResponse receiptFor(UUID riderId) {
        Rider rider = riders.findById(riderId)
                .orElseThrow(() -> NotFoundException.of("Rider", riderId));
        LocalDate today = clock.today();
        LocalDate start = BillingPeriod.startOnOrBefore(rider.getBillingDay(), today);

        PaymentPeriod period = periods.findByRiderIdAndPeriodStart(riderId, start).orElse(null);
        if (period == null) {
            return null;
        }
        period.recomputeStatus(today);

        PaymentCollection latest = collections.findByPeriodIdOrderByCollectedOnDesc(period.getId())
                .stream().findFirst().orElse(null);

        return PaymentReceiptResponse.from(period, rider.getRiderCode(), rider.getName(),
                registryIdsFor(List.of(period)).get(period.getVehicleId()), latest);
    }

    // -----------------------------------------------------------------------
    // Collections
    // -----------------------------------------------------------------------

    /**
     * Records money taken at the counter against the rider's current period.
     *
     * <p>Append-only: the collection is a new row, and {@code amount_paid} is
     * recomputed as {@code SUM(payment_collections)} rather than incremented,
     * so two people recording cash at the same counter cannot lose one of the
     * two payments. The period is locked for the length of this transaction to
     * make that sum stable.
     *
     * <p>Overpayment is accepted on purpose. The contract documents
     * {@code balance} as "positive means still owed", which already
     * anticipates a negative; riders pay ahead, and refusing the money at the
     * counter is worse than carrying a credit.
     */
    @Transactional
    public PaymentPeriodRowResponse record(UUID tenantId, UUID userId, RecordPaymentRequest request) {
        if (request.amount() <= 0) {
            throw new ValidationException("amount", "A payment must be more than zero");
        }
        PaymentMethod method = parseMethod(request.method());

        Rider rider = riders.findByRiderCode(request.riderId())
                .orElseThrow(() -> NotFoundException.of("Rider", request.riderId()));

        LocalDate today = clock.today();
        LocalDate start = BillingPeriod.startOnOrBefore(rider.getBillingDay(), today);

        PaymentPeriod period = periods.findForUpdate(rider.getId(), start)
                .orElseThrow(() -> new ConflictException(
                        rider.getName() + " has no line in the current billing period", "riderId"));

        collections.saveAndFlush(new PaymentCollection(
                tenantId, period.getId(), request.amount(), method, request.reference(), userId));

        period.applyCollected(collections.sumForPeriod(period.getId()), today);

        // Issued once, on the first collection, and never reissued -- a second
        // payment in the same week lands on the same receipt.
        if (period.getReceiptNo() == null) {
            period.assignReceiptNo(receiptNumbers.next(tenantId, today.getYear()));
        }

        // A week that reads PAID has cleared everything folded into its total,
        // service charges and carried arrears included. Settling them is not
        // bookkeeping tidiness: an OPEN charge against a paid week would be
        // picked up again as arrears on the next run and billed twice.
        if (period.getStatus() == PaymentStatus.PAID) {
            charges.findOpenUpTo(rider.getId(), period.getPeriodStart(), BILLABLE)
                    .forEach(charge -> charge.settle(java.time.Instant.now()));
        }

        periods.save(period);

        return PaymentPeriodRowResponse.from(period, rider.getRiderCode(), rider.getName(),
                registryIdsFor(List.of(period)).get(period.getVehicleId()),
                clock.today(), graceDays);
    }

    /**
     * A 422 naming the field, not Jackson's 400.
     *
     * <p>{@code method} arrives as a String precisely so this can happen: an
     * unrecognised value is a rule this module states, and every other rule in
     * it answers 422 with the field attached.
     */
    private PaymentMethod parseMethod(String method) {
        try {
            return PaymentMethod.valueOf(method.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ValidationException("method", "Payment method must be UPI, CASH or BANK_TRANSFER");
        }
    }

    // -----------------------------------------------------------------------
    // The rider profile's history panel (screen 08)
    // -----------------------------------------------------------------------

    /**
     * One rider's own ledger, newest week first.
     *
     * <p>Thinner than a run row on purpose: the run is where the calculation
     * is argued about; this only has to answer "was this week settled, and
     * how". {@code method} is the most recent collection's, and null while
     * nothing has been collected.
     */
    @Transactional
    public List<RiderPaymentRow> historyFor(UUID riderId) {
        riders.findById(riderId).orElseThrow(() -> NotFoundException.of("Rider", riderId));

        List<PaymentPeriod> rows = periods.findByRiderIdOrderByPeriodStartDesc(riderId);
        if (rows.isEmpty()) {
            return List.of();
        }
        LocalDate today = clock.today();
        rows.forEach(row -> row.recomputeStatus(today));

        // One query for every week's collections, not one per week. Newest
        // first, so the first entry seen for a period is the one to show.
        Map<UUID, PaymentMethod> latestMethod = new HashMap<>();
        collections.findByPeriodIdInOrderByCollectedOnDesc(rows.stream().map(PaymentPeriod::getId).toList())
                .forEach(c -> latestMethod.putIfAbsent(c.getPeriodId(), c.getMethod()));

        List<RiderPaymentRow> out = new ArrayList<>(rows.size());
        for (PaymentPeriod row : rows) {
            out.add(new RiderPaymentRow(
                    row.getId(),
                    row.getPeriodStart(),
                    row.getPeriodEnd(),
                    row.getTotalDuePaise(),
                    row.getAmountPaidPaise(),
                    row.getStatus(),
                    latestMethod.get(row.getId())));
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Shared lookups
    // -----------------------------------------------------------------------

    private Map<UUID, Rider> ridersFor(List<UUID> riderIds) {
        if (riderIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Rider> byId = new LinkedHashMap<>();
        riders.findAllById(riderIds).forEach(r -> byId.put(r.getId(), r));
        return byId;
    }

    /**
     * Row ids to the registry ids an operator actually reads ("BLRSS0428").
     *
     * <p>Empty today: {@link NoAssignmentsYet} leaves every {@code vehicleId}
     * null until S5. Written now so the day a real {@link AssignmentQuery}
     * arrives, the run and the receipt name the bike without another change
     * here.
     *
     * <p>A {@link HashMap} rather than {@link Map#of()}, and that is not
     * style. Callers look up {@code period.getVehicleId()}, which is null for
     * every row until S5, and an immutable map throws
     * {@link NullPointerException} on a null key instead of answering null.
     */
    private Map<UUID, String> registryIdsFor(List<PaymentPeriod> rows) {
        Map<UUID, String> byId = new HashMap<>();
        List<UUID> ids = rows.stream()
                .map(PaymentPeriod::getVehicleId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return byId;
        }
        vehicles.findAllById(ids).forEach(v -> byId.put(v.getId(), registryIdOf(v)));
        return byId;
    }

    private static String registryIdOf(Vehicle vehicle) {
        return vehicle.getRegistryId();
    }

    private static String nameOf(Map<UUID, Rider> riderById, UUID riderId) {
        Rider rider = riderById.get(riderId);
        return rider == null ? null : rider.getName();
    }

    private static String codeOf(Map<UUID, Rider> riderById, UUID riderId) {
        Rider rider = riderById.get(riderId);
        return rider == null ? null : rider.getRiderCode();
    }
}
