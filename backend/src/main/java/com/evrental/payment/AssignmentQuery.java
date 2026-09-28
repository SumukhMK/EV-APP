package com.evrental.payment;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * What the payment run needs to know about a rider's bike. Implemented by S5.
 *
 * <p>A run row needs two facts that only an assignment has: which bike the
 * rider held, and how many days of the week they actually held it — a mid-week
 * deboard bills fewer. S2 deliberately did not put {@code currentVehicleId} on
 * the rider (see Rider.java), because that is a property of the open
 * assignment, and {@code assignment/} holds nothing but a package-info today.
 *
 * <p><b>This interface lives in {@code payment/} rather than
 * {@code assignment/} on purpose.</b> {@code assignment/} is Abhiram's module,
 * and WORK_SPLIT.md says reaching into another person's file is a conversation,
 * not an edit. So the consumer declares its own need and the owner satisfies it
 * when the stage arrives. It is the second cross-module contract alongside
 * {@link com.evrental.service.ServiceJobFacade}, and the direction is reversed:
 * there SMK publishes and Abhiram calls; here SMK declares and Abhiram
 * implements.
 *
 * <p>Until S5 lands, {@link NoAssignmentsYet} answers empty and every run row
 * bills a full week against a bike the system cannot name. The arithmetic is
 * right; the attribution is incomplete, and that is the honest version of the
 * mock's guess at {@code onboardedOn}.
 */
public interface AssignmentQuery {

    /**
     * The rider's open assignment as it overlapped the given window, if any.
     *
     * @param riderId the rider being billed
     * @param from    the first day of the billing period
     * @param to      the last day of the billing period, inclusive
     * @return the assignment window, or empty when the rider held no bike
     */
    Optional<Window> openAssignmentFor(UUID riderId, LocalDate from, LocalDate to);

    /**
     * @param vehicleId  the bike's row id, frozen onto the period
     * @param registryId the id an operator reads, such as "BLRSS0428" — this
     *                   is what the run and receipt screens display
     * @param startedOn  when the rider took the bike
     * @param endedOn    when they handed it back, or null while it is open
     */
    record Window(UUID vehicleId, String registryId, LocalDate startedOn, LocalDate endedOn) {}
}
