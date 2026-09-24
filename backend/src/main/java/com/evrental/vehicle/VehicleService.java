package com.evrental.vehicle;

import com.evrental.common.ConflictException;
import com.evrental.common.Facet;
import com.evrental.common.NotFoundException;
import com.evrental.common.PageResponse;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /**
     * Induction. The vehicle is created and then moved into INDUCTED through
     * transitionState(), so the lifecycle log starts with the same code path
     * every later move uses -- from_state null is what "created" looks like.
     *
     * <p>make is derived rather than sent: CreateVehicleRequest has no make
     * field and the frontend's deriveMake() reads it off the model prefix. That
     * rule lives in two places until there is a real make list; see the S1
     * design's "Known compromises".
     */
    @Transactional
    public Vehicle create(CreateVehicleRequest request, UUID tenantId, UUID actorUserId, String actorName) {
        String registryId = request.id().trim();
        String chassisNumber = request.chassisNumber().trim();

        // Checked before insert so the caller gets a 409 naming the field the
        // form can highlight, rather than a constraint violation naming an index.
        vehicles.findByRegistryId(registryId).ifPresent(existing -> {
            throw new ConflictException("A vehicle with this id already exists", "id");
        });
        vehicles.findByChassisNumber(chassisNumber).ifPresent(existing -> {
            throw new ConflictException("This chassis number is already registered", "chassisNumber");
        });

        Vehicle vehicle = new Vehicle();
        vehicle.setTenantId(tenantId);
        vehicle.setRegistryId(registryId);
        vehicle.setChassisNumber(chassisNumber);
        vehicle.setMake(deriveMake(request.model()));
        vehicle.setModel(request.model().trim());
        vehicle.setBatteryType(request.batteryType().trim());
        vehicle.setBatteryVendor(blankToNull(request.batteryVendor()));
        vehicle.setHub(request.hub().trim());
        vehicle.setState(VehicleState.INDUCTED);
        vehicle.setRegistrationNumber(blankToNull(request.registrationNumber()));
        vehicle.setInductedOn(request.inductedOn());
        vehicle.setOdometerKm(0);
        vehicles.save(vehicle);

        VehicleLifecycleEvent induction = new VehicleLifecycleEvent();
        induction.setTenantId(tenantId);
        induction.setVehicleId(vehicle.getId());
        induction.setFromState(null);
        induction.setToState(VehicleState.INDUCTED);
        induction.setNote("Inducted");
        induction.setActorUserId(actorUserId);
        induction.setActorName(actorName);
        lifecycleEvents.save(induction);

        return vehicle;
    }

    /** Mirrors deriveMake() in frontend/app/src/lib/api/vehicles.ts. */
    static String deriveMake(String model) {
        return model != null && model.startsWith("Eagle") ? "e-Connects" : "e-Sprinto";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public Vehicle findByRegistryId(String registryId) {
        return vehicles.findByRegistryId(registryId)
                .orElseThrow(() -> NotFoundException.of("Vehicle", registryId));
    }

    public Page<Vehicle> search(VehicleQuery query, Pageable pageable) {
        return vehicles.search(
                searchPattern(query.q()),
                query.state(),
                filterValue(query.hub()),
                filterValue(query.make()),
                filterValue(query.batteryType()),
                pageable);
    }

    public List<Facet<String>> facets(VehicleQuery query) {
        String q = searchPattern(query.q());
        String hub = filterValue(query.hub());
        String make = filterValue(query.make());
        String batteryType = filterValue(query.batteryType());

        List<Object[]> counts = vehicles.countByState(q, hub, make, batteryType);
        long total = counts.stream().mapToLong(row -> (Long) row[1]).sum();

        List<Facet<String>> facets = counts.stream()
                .map(row -> new Facet<>(((VehicleState) row[0]).name(), ((VehicleState) row[0]).label(), (Long) row[1]))
                .sorted(Comparator.comparingLong(Facet<String>::count).reversed())
                .toList();

        java.util.ArrayList<Facet<String>> response = new java.util.ArrayList<>();
        response.add(new Facet<>("ALL", "All", total));
        response.addAll(facets);
        return response;
    }

    public FilterOptionsResponse filterOptions() {
        return new FilterOptionsResponse(vehicles.distinctMakes(), vehicles.distinctBatteryTypes());
    }

    /** The frontend sends "ALL" for an unset dropdown, and "" for an empty box. */
    private static String filterValue(String raw) {
        return raw == null || raw.isBlank() || "ALL".equals(raw) ? null : raw.trim();
    }

    private static String searchPattern(String raw) {
        return raw == null || raw.isBlank() ? null : "%" + raw.trim().toLowerCase() + "%";
    }
}
