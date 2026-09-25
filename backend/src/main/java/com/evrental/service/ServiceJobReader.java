package com.evrental.service;

import com.evrental.common.NotFoundException;
import com.evrental.common.PageResponse;
import com.evrental.vehicle.Vehicle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.evrental.vehicle.VehicleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reading jobs back.
 *
 * <p>Split from {@link ServiceJobService} because the two have different
 * shapes: the writer is a state machine with one path per verb, this is a set
 * of projections. Keeping them apart means neither file has to be read to
 * understand the other.
 *
 * <p>The one thing both care about is the registry id. Jobs store the bike's
 * UUID, screens read "BLRSS0428", so every response here resolves it -- in one
 * batch query per page, never one per row.
 */
@Service
@Transactional(readOnly = true)
public class ServiceJobReader {

    private final ServiceJobRepository jobs;
    private final ServiceJobEventRepository events;
    private final ServiceJobItemRepository items;
    private final QcInspectionRepository inspections;
    private final VehicleRepository vehicles;

    public ServiceJobReader(ServiceJobRepository jobs,
                            ServiceJobEventRepository events,
                            ServiceJobItemRepository items,
                            QcInspectionRepository inspections,
                            VehicleRepository vehicles) {
        this.jobs = jobs;
        this.events = events;
        this.items = items;
        this.inspections = inspections;
        this.vehicles = vehicles;
    }

    public PageResponse<ServiceJobResponse> list(ServiceJobStatus status,
                                                 ServiceQueue queue,
                                                 ServiceJobSource source,
                                                 String vehicleRegistryId,
                                                 Pageable pageable) {
        UUID vehicleId = null;
        if (vehicleRegistryId != null && !vehicleRegistryId.isBlank()) {
            // An unknown registry id filters to nothing rather than 404ing:
            // a filter that matches no rows is an empty list, not an error.
            vehicleId = vehicles.findByRegistryId(vehicleRegistryId.trim())
                    .map(Vehicle::getId)
                    .orElse(NO_SUCH_VEHICLE);
        }

        Page<ServiceJob> page = jobs.search(status, queue, source, vehicleId, pageable);
        Map<UUID, String> registryIds = registryIdsFor(page.getContent());
        return PageResponse.from(page, job -> ServiceJobResponse.summary(job, registryIds.get(job.getVehicleId())));
    }

    /**
     * A uuid no vehicle has, so a filter on an unknown registry id matches
     * nothing. Passing null would instead mean "do not filter" and return
     * every job, which is the opposite of what was asked.
     */
    private static final UUID NO_SUCH_VEHICLE = new UUID(0L, 0L);

    public ServiceJobResponse detail(UUID jobId) {
        ServiceJob job = jobs.findById(jobId)
                .orElseThrow(() -> NotFoundException.of("Service job", jobId));
        return ServiceJobResponse.detail(
                job,
                registryIdOf(job.getVehicleId()),
                events.findByJobIdOrderByOccurredOnAsc(jobId),
                items.findByJobId(jobId),
                inspections.findByJobIdOrderByInspectedOnAsc(jobId));
    }

    public List<QcInspectionResponse> qcHistory(UUID jobId) {
        if (!jobs.existsById(jobId)) {
            throw NotFoundException.of("Service job", jobId);
        }
        return inspections.findByJobIdOrderByInspectedOnAsc(jobId).stream()
                .map(QcInspectionResponse::from)
                .toList();
    }

    /**
     * Every queue, including the empty ones. A dashboard strip that dropped a
     * queue the moment it emptied would reflow itself all day.
     */
    public List<QueueCountResponse> queueCounts() {
        Map<ServiceQueue, Long> counted = new HashMap<>();
        for (Object[] row : jobs.countOpenByQueue()) {
            counted.put((ServiceQueue) row[0], (Long) row[1]);
        }
        List<QueueCountResponse> out = new ArrayList<>(ServiceQueue.values().length);
        for (ServiceQueue queue : ServiceQueue.values()) {
            out.add(new QueueCountResponse(queue, queue.label(), counted.getOrDefault(queue, 0L)));
        }
        return out;
    }

    private String registryIdOf(UUID vehicleId) {
        return vehicles.findById(vehicleId).map(Vehicle::getRegistryId).orElse(null);
    }

    private Map<UUID, String> registryIdsFor(List<ServiceJob> page) {
        List<UUID> ids = page.stream().map(ServiceJob::getVehicleId).distinct().toList();
        Map<UUID, String> byId = new HashMap<>();
        for (Vehicle vehicle : vehicles.findAllById(ids)) {
            byId.put(vehicle.getId(), vehicle.getRegistryId());
        }
        return byId;
    }
}
