package com.evrental.vehicle;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The vehicle registry.
 *
 * <p>transitionState() is the only code in the system that writes
 * vehicles.state. Not the controller, not S4, not S5. Making it the only door
 * is what stops the lifecycle log from quietly going incomplete: a state change
 * that is not logged is not reachable.
 */
@Service
public class VehicleService implements VehicleTransitions {

    private final VehicleRepository vehicles;
    private final VehicleLifecycleEventRepository lifecycleEvents;
    private final VehicleStateMachine machine;

    public VehicleService(VehicleRepository vehicles,
                          VehicleLifecycleEventRepository lifecycleEvents,
                          VehicleStateMachine machine) {
        this.vehicles = vehicles;
        this.lifecycleEvents = lifecycleEvents;
        this.machine = machine;
    }

    @Override
    @Transactional
    public Vehicle transitionState(UUID vehicleId, VehicleState toState, String note,
                                   UUID actorUserId, String actorName) {
        // Locked, not merely read: see VehicleRepository.findByIdForUpdate.
        Vehicle vehicle = vehicles.findByIdForUpdate(vehicleId)
                .orElseThrow(() -> NotFoundException.of("Vehicle", vehicleId));

        VehicleState fromState = vehicle.getState();
        if (fromState == toState) {
            // A screen firing an idempotent save is not an error, and it is not
            // history either. Nothing written, nothing logged.
            return vehicle;
        }
        if (!machine.canTransition(fromState, toState)) {
            throw new ConflictException(
                    "A vehicle that is " + fromState.label() + " cannot become " + toState.label());
        }

        vehicle.setState(toState);
        vehicles.save(vehicle);

        VehicleLifecycleEvent event = new VehicleLifecycleEvent();
        event.setTenantId(vehicle.getTenantId());
        event.setVehicleId(vehicle.getId());
        event.setFromState(fromState);
        event.setToState(toState);
        event.setNote(note);
        event.setActorUserId(actorUserId);
        event.setActorName(actorName);
        lifecycleEvents.save(event);

        return vehicle;
    }
}
