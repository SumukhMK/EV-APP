package com.evrental.assignment;

import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * The assignment module's answer to the payment module's question.
 *
 * <p>{@code payment/} declares {@link com.evrental.payment.AssignmentQuery}
 * because the run needs two facts only an assignment has: which bike the rider
 * held, and how many days of the week they actually held it. WORK_SPLIT.md
 * calls this the one contract whose direction is reversed — elsewhere the
 * service module publishes a method and this one calls it; here the consumer
 * declares its need and the owner satisfies it.
 *
 * <p><b>Why this did not arrive with S5.</b> The assignment module published
 * its own {@link AssignmentQuery} — the rider and vehicle reads — and the two
 * interfaces share a simple name in different packages. S5 landing therefore
 * looked like it had satisfied the contract and had not, so
 * {@code NoAssignmentsYet} went on answering empty for every rider and every
 * run row billed a full seven days against a bike it could not name. The
 * arithmetic was right and the attribution was absent, which is the shape of
 * error nobody notices until a rider who gave the bike back on Wednesday is
 * billed to Sunday.
 *
 * <p>{@code @Primary} rather than replacing {@code NoAssignmentsYet}: that
 * bean's javadoc asks for exactly this, it keeps {@code payment/} unedited,
 * and it leaves a working fallback for any context where this module is not
 * loaded.
 */
@Component
@Primary
public class PaymentAssignmentQuery implements com.evrental.payment.AssignmentQuery {

    private final AssignmentRepository assignments;
    private final VehicleRepository vehicles;

    public PaymentAssignmentQuery(AssignmentRepository assignments, VehicleRepository vehicles) {
        this.assignments = assignments;
        this.vehicles = vehicles;
    }

    /**
     * The assignment that overlapped the billing week, or empty if none did.
     *
     * <p>Despite the name on the interface this is deliberately <b>not</b>
     * restricted to open rows. The week being billed is usually in the past by
     * the time anyone looks at it, and the rider most likely to be billed
     * wrongly is precisely the one who handed the bike back — whose row is
     * closed. Reading only open assignments would bill a full week to someone
     * who left on Tuesday.
     *
     * <p>When a rider exchanged mid-week there are two overlapping rows. The
     * window returned spans from the earliest start to the latest end, so the
     * days billed cover both, and the bike named is the one they ended on —
     * a period carries a single vehicle column, and the bike they hold now is
     * the one an operator chasing the payment needs to ask about.
     */
    @Override
    public Optional<Window> openAssignmentFor(UUID riderId, LocalDate from, LocalDate to) {
        List<Assignment> overlapping = assignments.findByRiderIdOrderByStartedOnDesc(riderId).stream()
                .filter(a -> overlaps(a, from, to))
                .sorted(Comparator.comparing(Assignment::getStartedOn))
                .toList();
        if (overlapping.isEmpty()) {
            return Optional.empty();
        }

        Assignment first = overlapping.get(0);
        Assignment last = overlapping.get(overlapping.size() - 1);

        // Null end means still open, and must stay null rather than becoming
        // the window's end: the caller clamps it, and a date here would claim
        // the bike came back.
        LocalDate endedOn = last.getEndedOn();

        String registryId = vehicles.findById(last.getVehicleId())
                .map(Vehicle::getRegistryId)
                .orElse(null);

        return Optional.of(new Window(last.getVehicleId(), registryId, first.getStartedOn(), endedOn));
    }

    /** Closed-open on neither side: both ends of a billing week are inclusive. */
    private static boolean overlaps(Assignment a, LocalDate from, LocalDate to) {
        if (a.getStartedOn().isAfter(to)) {
            return false;
        }
        return a.getEndedOn() == null || !a.getEndedOn().isBefore(from);
    }
}
