package com.evrental.assignment;

import com.evrental.rider.Rider;
import com.evrental.rider.RiderRepository;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import com.evrental.vehicle.VehicleState;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * The read facade the rider and vehicle modules inject. Answers the derived
 * fields the entities deliberately do not store — a rider's currentVehicleId,
 * a bike's currentRiderId/currentRiderName and its assignment history — from
 * the open assignment rows, so there is exactly one copy of "who has which
 * bike".
 *
 * <p>Read-only and stateless; every method is tenant-scoped by RLS on the
 * caller's transaction.
 */
@Service
public class AssignmentQueryService implements AssignmentQuery {

    private final AssignmentRepository assignments;
    private final RiderRepository riders;
    private final VehicleRepository vehicles;

    public AssignmentQueryService(AssignmentRepository assignments,
                                  RiderRepository riders,
                                  VehicleRepository vehicles) {
        this.assignments = assignments;
        this.riders = riders;
        this.vehicles = vehicles;
    }

    @Override
    public CurrentRider currentRiderOf(UUID vehicleId) {
        return assignments.findOpenByVehicleId(vehicleId)
                .map(a -> riderOf(a.getRiderId()))
                .orElse(null);
    }

    @Override
    public Map<UUID, CurrentRider> currentRidersOf(Collection<UUID> vehicleIds) {
        if (vehicleIds.isEmpty()) {
            return Map.of();
        }
        List<Assignment> open = assignments.findOpenByVehicleIdIn(vehicleIds);
        Map<UUID, Rider> ridersById = ridersById(open.stream().map(Assignment::getRiderId).toList());
        Map<UUID, CurrentRider> out = new HashMap<>();
        for (Assignment a : open) {
            Rider rider = ridersById.get(a.getRiderId());
            if (rider != null) {
                out.put(a.getVehicleId(), new CurrentRider(rider.getRiderCode(), rider.getName()));
            }
        }
        return out;
    }

    @Override
    public List<AssignmentHistoryRow> historyFor(UUID vehicleId) {
        List<Assignment> history = assignments.findByVehicleIdOrderByStartedOnDesc(vehicleId);
        Map<UUID, Rider> ridersById = ridersById(history.stream().map(Assignment::getRiderId).toList());
        return history.stream().map(a -> {
            Rider rider = ridersById.get(a.getRiderId());
            return new AssignmentHistoryRow(
                    rider == null ? null : rider.getRiderCode(),
                    rider == null ? "Unknown rider" : rider.getName(),
                    rider == null ? 0 : rider.getPlanAmountPaise(),
                    a.getStartedOn(),
                    a.getEndedOn(),
                    (int) ChronoUnit.DAYS.between(
                            a.getStartedOn(), a.getEndedOn() == null ? LocalDate.now() : a.getEndedOn()),
                    a.getClosedBy());
        }).toList();
    }

    /**
     * The rider's side of the same table.
     *
     * <p>The registry ids are read in one batch rather than per row: a rider
     * with a long history would otherwise be one query per bike on a screen
     * that is already doing two.
     */
    @Override
    public List<RiderAssignmentRow> historyForRider(UUID riderId) {
        List<Assignment> history = assignments.findByRiderIdOrderByStartedOnDesc(riderId);
        if (history.isEmpty()) {
            return List.of();
        }
        Map<UUID, String> registryById = new java.util.LinkedHashMap<>();
        vehicles.findAllById(history.stream().map(Assignment::getVehicleId).distinct().toList())
                .forEach(v -> registryById.put(v.getId(), v.getRegistryId()));

        return history.stream().map(a -> new RiderAssignmentRow(
                registryById.get(a.getVehicleId()),
                a.getStartedOn(),
                a.getEndedOn(),
                (int) ChronoUnit.DAYS.between(
                        a.getStartedOn(), a.getEndedOn() == null ? LocalDate.now() : a.getEndedOn()),
                a.getReason(),
                // The enum's name, not the enum: this record is a wire shape
                // and the frontend already has its own labels for these.
                a.getReturnCondition() == null ? null : a.getReturnCondition().name(),
                a.getClosedBy())).toList();
    }

    @Override
    public String currentVehicleIdOf(UUID riderId) {
        return assignments.findOpenByRiderId(riderId)
                .map(a -> registryIdOf(a.getVehicleId()))
                .orElse(null);
    }

    @Override
    public Map<UUID, String> currentVehicleIdsOf(Collection<UUID> riderIds) {
        if (riderIds.isEmpty()) {
            return Map.of();
        }
        List<Assignment> open = assignments.findOpenByRiderIdIn(riderIds);
        Map<UUID, String> registryIds = registryIdsOf(open.stream().map(Assignment::getVehicleId).toList());
        Map<UUID, String> out = new HashMap<>();
        for (Assignment a : open) {
            String registryId = registryIds.get(a.getVehicleId());
            if (registryId != null) {
                out.put(a.getRiderId(), registryId);
            }
        }
        return out;
    }

    @Override
    public Set<UUID> riderIdsHoldingBikes() {
        return assignments.findByEndedOnIsNull().stream()
                .map(Assignment::getRiderId)
                .collect(Collectors.toSet());
    }

    @Override
    public Set<UUID> riderIdsWhoseVehicleIsIn(VehicleState state) {
        return assignments.riderIdsWhoseVehicleIsIn(state);
    }

    private CurrentRider riderOf(UUID riderId) {
        return riders.findById(riderId)
                .map(r -> new CurrentRider(r.getRiderCode(), r.getName()))
                .orElse(null);
    }

    private Map<UUID, Rider> ridersById(Collection<UUID> ids) {
        return ids.isEmpty() ? Map.of()
                : riders.findAllById(ids).stream()
                        .collect(Collectors.toMap(Rider::getId, Function.identity()));
    }

    private String registryIdOf(UUID vehicleId) {
        return vehicles.findById(vehicleId).map(Vehicle::getRegistryId).orElse(null);
    }

    private Map<UUID, String> registryIdsOf(Collection<UUID> ids) {
        return ids.isEmpty() ? Map.of()
                : vehicles.findAllById(ids).stream()
                        .collect(Collectors.toMap(Vehicle::getId, Vehicle::getRegistryId));
    }
}