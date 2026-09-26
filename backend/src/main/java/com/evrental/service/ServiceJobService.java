package com.evrental.service;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import com.evrental.vehicle.VehicleState;
import com.evrental.vehicle.VehicleStateMachine;
import com.evrental.vehicle.VehicleTransitions;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The workshop.
 *
 * <p>Everything a job does to a bike goes through
 * {@link VehicleTransitions#transitionState} -- this class never writes
 * vehicles.state itself. That is not politeness between modules: the lifecycle
 * log is written by that method, so a state change made any other way is a
 * state change with no history.
 *
 * <p>Opening and closing a job move the bike in the *same* transaction,
 * because an operator is watching the screen and a bike that is half-moved is
 * a bike nobody can find. The rider's charge leaves on the async pool instead,
 * because it is only read at the next weekly payment run.
 */
@Service
public class ServiceJobService implements ServiceJobFacade {

    /**
     * A retired bike is off the books, and no amount of paperwork brings it
     * back — the state machine gives RETIRED no outgoing edges at all.
     *
     * <p>This is the whole guard, deliberately. An earlier version listed the
     * states a bike was allowed to come *from*, which was a second copy of the
     * state machine's table and promptly disagreed with it: a bike sitting in
     * the yard as Ready to Deploy, which somebody notices a fault on, could not
     * be taken in. The other two cases already have an owner — a bike that is
     * in the workshop is caught by the open-job check just below, and an
     * illegal move is caught by the state machine itself, in its own words.
     */
    private static final Set<VehicleState> NOT_OPENABLE_FROM = EnumSet.of(VehicleState.RETIRED);

    private final ServiceJobRepository jobs;
    private final ServiceJobEventRepository events;
    private final ServiceJobItemRepository items;
    private final QcInspectionRepository inspections;
    private final VehicleRepository vehicles;
    private final VehicleTransitions vehicleTransitions;
    private final VehicleStateMachine stateMachine;
    private final ApplicationEventPublisher publisher;

    public ServiceJobService(ServiceJobRepository jobs,
                             ServiceJobEventRepository events,
                             ServiceJobItemRepository items,
                             QcInspectionRepository inspections,
                             VehicleRepository vehicles,
                             VehicleTransitions vehicleTransitions,
                             VehicleStateMachine stateMachine,
                             ApplicationEventPublisher publisher) {
        this.jobs = jobs;
        this.events = events;
        this.items = items;
        this.inspections = inspections;
        this.vehicles = vehicles;
        this.vehicleTransitions = vehicleTransitions;
        this.stateMachine = stateMachine;
        this.publisher = publisher;
    }

    // -----------------------------------------------------------------------
    // Opening
    // -----------------------------------------------------------------------

    @Transactional
    public ServiceJob open(CreateServiceJobRequest request, UUID tenantId, UUID actorUserId, String actorName) {
        Vehicle vehicle = vehicles.findByRegistryId(request.vehicleId().trim())
                // RLS hides another tenant's bike, so "not yours" and "not
                // there" arrive here as the same thing -- which is the answer
                // the caller should get either way.
                .orElseThrow(() -> NotFoundException.of("Vehicle", request.vehicleId()));

        // Asked before the state check, because it is the more useful answer.
        // A bike already in the workshop fails both tests, and "it is already
        // in service" tells the operator what to do next; "a vehicle that is
        // In Service cannot be taken into service" only tells them no. The
        // unique index still backs this up for two callers arriving together.
        if (jobs.findOpenForVehicle(vehicle.getId()).isPresent()) {
            throw new ConflictException("This bike already has an open service job");
        }
        if (NOT_OPENABLE_FROM.contains(vehicle.getState())) {
            throw new ConflictException(
                    "A vehicle that is " + vehicle.getState().label() + " cannot be taken into service");
        }

        ServiceQueue queue = request.queue() != null
                ? request.queue()
                : request.damageCategory().defaultQueue();

        ServiceJob job = new ServiceJob();
        job.setTenantId(tenantId);
        job.setVehicleId(vehicle.getId());
        job.setRiderId(request.riderId());
        job.setSource(request.source());
        job.setDamageCategory(request.damageCategory());
        job.setQueue(queue);
        job.setStatus(ServiceJobStatus.OPEN);
        job.setDamageNotes(request.damageNotes());
        job.setLocation(request.location());
        job.setReference(request.reference());

        ServiceJob saved = saveOrConflict(job);

        VehicleState moved = moveIntoService(
                vehicle, queue.vehicleState(),
                "Service job opened — " + queue.label(), actorUserId, actorName);

        log(saved, moved, actorName, openingNote(request, queue));
        return saved;
    }

    /**
     * Moves a bike into the state its queue implies, returning it first when
     * that is the only legal road.
     *
     * <p>A bike that is out with a rider cannot go straight to Quality Check:
     * the state machine refuses DEPLOYED → QC_PENDING because, in
     * serviceWorkflow.ts's words, "every return must go through QC or service
     * first" — a bike cannot be inspected while it is still out. But the bike
     * physically *is* back; that is why someone is opening a job on it. So the
     * return is recorded rather than skipped, and the lifecycle log ends up
     * saying what actually happened: it came back, then it went to QC.
     *
     * <p>Repair queues need none of this — DEPLOYED → UNDER_REPAIR is a legal
     * edge on purpose, for a roadside repair with no recorded return.
     */
    private VehicleState moveIntoService(Vehicle vehicle, VehicleState target, String note,
                                         UUID actorUserId, String actorName) {
        VehicleState from = vehicle.getState();
        if (!stateMachine.canTransition(from, target)
                && stateMachine.canTransition(from, VehicleState.RETURNED)
                && stateMachine.canTransition(VehicleState.RETURNED, target)) {
            vehicleTransitions.transitionState(
                    vehicle.getId(), VehicleState.RETURNED, "Returned for service", actorUserId, actorName);
        }
        return vehicleTransitions
                .transitionState(vehicle.getId(), target, note, actorUserId, actorName)
                .getState();
    }

    /**
     * The partial unique index is the only thing standing between two
     * simultaneous deboards and two open jobs on one bike. Reading first and
     * writing second would be a race however carefully it were written, so the
     * write is attempted and the violation translated.
     */
    private ServiceJob saveOrConflict(ServiceJob job) {
        try {
            return jobs.saveAndFlush(job);
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException("This bike already has an open service job");
        }
    }

    private String openingNote(CreateServiceJobRequest request, ServiceQueue queue) {
        String tag = request.damageCategory().label() + " damage → " + queue.label();
        return request.damageNotes() == null || request.damageNotes().isBlank()
                ? tag
                : tag + ". " + request.damageNotes().trim();
    }

    // -----------------------------------------------------------------------
    // Working
    // -----------------------------------------------------------------------

    /**
     * Queues that mean the bike is waiting on somebody outside the workshop.
     * Each needs the claim or order number, or nobody can chase it.
     */
    private static final Set<ServiceQueue> NEEDS_REFERENCE =
            EnumSet.of(ServiceQueue.WARRANTY, ServiceQueue.INSURANCE, ServiceQueue.PARTS_WAITING);

    /** Leaving the bench — for checking or for the road — needs a name and a record of the work. */
    private static final Set<ServiceQueue> LEAVING_THE_BENCH =
            EnumSet.of(ServiceQueue.QC_PENDING, ServiceQueue.READY_TO_DEPLOY);

    @Transactional
    public ServiceJob update(UUID jobId, UpdateServiceJobRequest request, UUID actorUserId, String actorName) {
        ServiceJob job = openJobForWrite(jobId);
        checkSaveRules(job, request);

        ServiceQueue previousQueue = job.getQueue();
        job.setQueue(request.queue());
        job.setDamageCategory(request.damageCategory());
        if (request.workSummary() != null) {
            job.setWorkSummary(request.workSummary());
        }
        if (request.technician() != null) {
            job.setTechnician(request.technician());
        }
        if (request.reference() != null) {
            job.setReference(request.reference());
        }
        // A job anyone has saved once is no longer merely open.
        job.setStatus(ServiceJobStatus.IN_PROGRESS);

        if (request.items() != null) {
            job.setTotalCostPaise(replaceItems(job, request.items()));
        }

        jobs.save(job);

        VehicleState state = job.getQueue().vehicleState();
        if (previousQueue != job.getQueue()) {
            // The state machine may refuse the move -- a retired bike routed
            // to a repair queue, say. Its 409 is the right answer and names
            // both states in the words on the screen, so it is left alone.
            state = vehicleTransitions.transitionState(
                    job.getVehicleId(), job.getQueue().vehicleState(),
                    "Moved to " + job.getQueue().label(), actorUserId, actorName).getState();
        }

        log(job, state, actorName, updateNote(request));
        return job;
    }

    /**
     * The rules that used to live only in the browser.
     *
     * <p>Every one of these came from `mocks/serviceJobs.ts`, where the screens
     * have relied on them since the prototype — and where the API could not see
     * them. Their messages are the mock's own wording, so a screen that already
     * prints one keeps printing the same sentence.
     */
    private void checkSaveRules(ServiceJob job, UpdateServiceJobRequest request) {
        if (!hasServiceNote(request.note())) {
            throw new ValidationException("note",
                    "Write what you found, or why you are making this change");
        }
        // The queue the job is heading to, which is what the rules are about --
        // a bike already sitting in Parts Waiting is not the question.
        ServiceQueue target = request.queue();
        if (NEEDS_REFERENCE.contains(target) && isBlank(effective(request.reference(), job.getReference()))) {
            throw new ValidationException("reference",
                    "Add the claim number, or say which parts you are waiting for");
        }
        if (LEAVING_THE_BENCH.contains(target)) {
            if (isBlank(effective(request.technician(), job.getTechnician()))) {
                throw new ValidationException("technician",
                        "Say who did the work before QC or before the bike goes back out");
            }
            if (isBlank(effective(request.workSummary(), job.getWorkSummary()))) {
                throw new ValidationException("workSummary",
                        "Write what you did, or say that no repair was needed, "
                                + "before QC or before the bike goes back out");
            }
        }
    }

    /**
     * A note that says something.
     *
     * <p>Mirrors hasServiceNote() in lib/serviceWorkflow.ts, including the odd
     * bit: a leading "QC passed:" or "QC failed:" is stripped before deciding,
     * because the prefix is the screen's doing and says nothing about what the
     * person actually found.
     */
    private static boolean hasServiceNote(String note) {
        return note != null && !note.replaceFirst("(?i)^QC (passed|failed):\\s*", "").isBlank();
    }

    /** What the field will hold after this save: what was sent, or what is already there. */
    private static String effective(String incoming, String existing) {
        return incoming != null ? incoming : existing;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * The operator's own words, always.
     *
     * <p>There used to be a generated fallback here — "Moved from Minor repair
     * to Waiting for parts" — for saves that arrived without a note. Since
     * checkSaveRules() started requiring one, that branch could never run, and
     * a fallback that cannot fire is worse than none: it reads as a guarantee
     * the code no longer makes. The queue change is on the event row anyway.
     */
    private String updateNote(UpdateServiceJobRequest request) {
        return request.note().trim();
    }

    /** Replaces every cost line and returns the new total. */
    private long replaceItems(ServiceJob job, List<ServiceJobItemRequest> lines) {
        items.deleteByJobId(job.getId());
        // Flushed before the inserts so the delete cannot be reordered after
        // them and take the new rows with it.
        items.flush();

        long total = 0;
        for (ServiceJobItemRequest line : lines) {
            ServiceJobItem item = new ServiceJobItem();
            item.setTenantId(job.getTenantId());
            item.setJobId(job.getId());
            item.setLabel(line.label().trim());
            item.setCostPaise(line.costPaise());
            item.setKind(line.kindOrDefault());
            items.save(item);
            total += line.costPaise();
        }
        return total;
    }

    // -----------------------------------------------------------------------
    // Quality check
    // -----------------------------------------------------------------------

    @Transactional
    public QcInspection submitQc(UUID jobId, SubmitQcRequest request, UUID actorUserId, String actorName) {
        ServiceJob job = openJobForWrite(jobId);

        Map<String, Boolean> checks = validatedChecks(request.checks());
        boolean passed = QcChecks.allPassed(checks);

        QcInspection inspection = new QcInspection();
        inspection.setTenantId(job.getTenantId());
        inspection.setJobId(job.getId());
        inspection.setVehicleId(job.getVehicleId());
        inspection.setChecks(checks);
        inspection.setPassed(passed);
        inspection.setInspector(request.inspector().trim());
        inspection.setNotes(request.notes());
        inspections.save(inspection);

        // A pass sends the bike back to the fleet; a fail sends it back to the
        // bench. Either way the queue and the bike move together, because a
        // bike marked Ready to Deploy while its job sits in QC is a bike two
        // screens disagree about.
        ServiceQueue nextQueue = passed ? ServiceQueue.READY_TO_DEPLOY : reworkQueueFor(job);
        job.setQueue(nextQueue);
        job.setStatus(ServiceJobStatus.IN_PROGRESS);
        jobs.save(job);

        VehicleState state = vehicleTransitions.transitionState(
                job.getVehicleId(), nextQueue.vehicleState(),
                passed ? "QC passed" : "QC failed — back for rework",
                actorUserId, actorName).getState();

        log(job, state, actorName, qcNote(passed, checks));
        return inspection;
    }

    /**
     * Where a failed bike goes back to. Its damage category is the best
     * evidence of how much work is left; a bike that arrived undamaged and
     * still failed QC has something wrong that nobody has categorised yet, so
     * it goes for assessment rather than to a repair bench nobody chose.
     */
    private ServiceQueue reworkQueueFor(ServiceJob job) {
        ServiceQueue fromDamage = job.getDamageCategory().defaultQueue();
        return fromDamage.isRepair() ? fromDamage : ServiceQueue.ASSESSMENT;
    }

    private Map<String, Boolean> validatedChecks(Map<String, Boolean> submitted) {
        List<String> missing = QcChecks.missingFrom(submitted);
        if (!missing.isEmpty()) {
            throw new ValidationException("checks",
                    "Every safety check must be answered. Missing: " + String.join(", ", missing));
        }
        List<String> unknown = QcChecks.unknownIn(submitted);
        if (!unknown.isEmpty()) {
            throw new ValidationException("checks",
                    "Unknown safety check: " + String.join(", ", unknown));
        }
        // Rebuilt in the canonical order so a stored inspection reads the same
        // way whatever order the client happened to serialise it in.
        Map<String, Boolean> ordered = new LinkedHashMap<>();
        for (String name : QcChecks.REQUIRED) {
            ordered.put(name, submitted.get(name));
        }
        return ordered;
    }

    private String qcNote(boolean passed, Map<String, Boolean> checks) {
        if (passed) {
            return "QC passed — all nine checks clear";
        }
        List<String> failed = QcChecks.REQUIRED.stream()
                .filter(name -> !Boolean.TRUE.equals(checks.get(name)))
                .toList();
        return "QC failed on " + String.join(", ", failed);
    }

    // -----------------------------------------------------------------------
    // Closing
    // -----------------------------------------------------------------------

    @Transactional
    public ServiceJob close(UUID jobId, CloseServiceJobRequest request, UUID actorUserId, String actorName) {
        // Locked, not merely read: two closes racing would otherwise both see
        // an open job and both raise a charge, and a rider billed twice for
        // one repair is the failure this module must not have.
        ServiceJob job = jobs.findByIdForUpdate(jobId)
                .orElseThrow(() -> NotFoundException.of("Service job", jobId));
        if (job.isClosed()) {
            throw new ConflictException("This job is already closed");
        }
        // Billing a rider who is not on the bike bills nobody: the charge would
        // be raised against a null id and quietly vanish. From the mock, where
        // the screens have relied on this since the prototype.
        if (request.liability().raisesCharge() && job.getRiderId() == null) {
            throw new ValidationException("liability",
                    "No rider is on this bike, so the company has to cover the cost.");
        }

        if (request.items() != null) {
            job.setTotalCostPaise(replaceItems(job, request.items()));
        }
        if (request.technician() != null) {
            job.setTechnician(request.technician());
        }
        job.setLiability(request.liability());
        job.setStatus(ServiceJobStatus.CLOSED);
        job.setClosedOn(Instant.now());
        jobs.save(job);

        VehicleState state = releaseIfRoadworthy(job, actorUserId, actorName);

        log(job, state, actorName, closingNote(request, job));

        if (request.liability().raisesCharge()) {
            // Published inside the transaction but delivered after it commits
            // (@TransactionalEventListener in the money module): a charge for
            // a close that then rolled back is a rider billed for work that
            // did not happen.
            publisher.publishEvent(new ServiceJobClosedEvent(
                    job.getTenantId(), job.getId(), job.getVehicleId(),
                    job.getRiderId(), job.getLiability(), job.getTotalCostPaise()));
        }
        return job;
    }

    /**
     * Puts the bike back in the fleet, but only if it has earned it.
     *
     * <p>Closing a job is a decision about money, not about whether a bike is
     * safe: QC is what releases it (UNDER_REPAIR → QC_PENDING →
     * READY_TO_DEPLOY, and the state machine allows no shortcut). So a job
     * closed after a passed QC finds the bike already released and this is a
     * no-op; a job closed while the bike is still on the bench leaves it on the
     * bench. Forcing the move would be the paperwork declaring a bike
     * roadworthy that nobody has checked.
     *
     * <p>Deliberately not an error either. Refusing to close would leave the
     * fleet unable to settle a written-off bike, and the activity log records
     * which of the two happened.
     */
    private VehicleState releaseIfRoadworthy(ServiceJob job, UUID actorUserId, String actorName) {
        Vehicle vehicle = vehicles.findById(job.getVehicleId())
                .orElseThrow(() -> NotFoundException.of("Vehicle", job.getVehicleId()));
        VehicleState target = ServiceQueue.READY_TO_DEPLOY.vehicleState();
        if (!stateMachine.canTransition(vehicle.getState(), target)) {
            return vehicle.getState();
        }
        return vehicleTransitions
                .transitionState(job.getVehicleId(), target, "Released from service", actorUserId, actorName)
                .getState();
    }

    private String closingNote(CloseServiceJobRequest request, ServiceJob job) {
        if (request.note() != null && !request.note().isBlank()) {
            return request.note().trim();
        }
        return "Closed — " + job.getLiability().name().toLowerCase() + " pays "
                + (job.getTotalCostPaise() / 100) + " rupees";
    }

    // -----------------------------------------------------------------------
    // The facade other modules call
    // -----------------------------------------------------------------------

    @Override
    @Transactional
    public ServiceJob openJob(UUID tenantId, String vehicleId, UUID riderId, ServiceJobSource source,
                              DamageCategory damage, String damageNotes, String actor) {
        return open(new CreateServiceJobRequest(
                vehicleId, riderId, source, damage, damageNotes, null, null, null),
                tenantId, null, actor);
    }

    // -----------------------------------------------------------------------
    // Shared
    // -----------------------------------------------------------------------

    /** A job that exists and can still be written to. */
    private ServiceJob openJobForWrite(UUID jobId) {
        ServiceJob job = jobs.findById(jobId)
                .orElseThrow(() -> NotFoundException.of("Service job", jobId));
        if (job.isClosed()) {
            throw new ConflictException("This job is closed and cannot be changed");
        }
        return job;
    }

    private void log(ServiceJob job, VehicleState state, String actor, String note) {
        ServiceJobEvent event = new ServiceJobEvent();
        event.setTenantId(job.getTenantId());
        event.setJobId(job.getId());
        event.setQueue(job.getQueue());
        event.setVehicleState(state);
        event.setActor(actor);
        event.setNote(note == null ? "" : note);
        events.save(event);
    }
}
