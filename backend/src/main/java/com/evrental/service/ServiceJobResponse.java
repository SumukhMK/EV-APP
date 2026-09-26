package com.evrental.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A job as the screens read it, field-for-field against ServiceJob in
 * frontend/app/src/types/serviceJob.ts. There is no mapping layer beyond this
 * record: the JSON *is* the type.
 *
 * <p>vehicleId is the registry id, not the row's UUID -- the column is a real
 * foreign key (see V006) and the translation happens here, once, so the wire
 * keeps saying "BLRSS0428" the way every screen already expects.
 *
 * <p>activity, items and inspections are empty on a list row and filled on the
 * detail read. A list that loaded three child collections per row to show none
 * of them would be three needless queries a page.
 */
public record ServiceJobResponse(
        UUID id,
        String vehicleId,
        UUID riderId,
        ServiceJobSource source,
        DamageCategory damageCategory,
        ServiceQueue queue,
        String location,
        String reference,
        String workSummary,
        List<ServiceJobEventResponse> activity,
        List<QcInspectionResponse> inspections,
        String damageNotes,
        List<ServiceJobItemResponse> items,
        long totalCostPaise,
        ServiceLiability liability,
        ServiceJobStatus status,
        String technician,
        Instant createdOn,
        Instant closedOn,
        Instant updatedOn) {

    /** A list row: the job itself, with its child collections left empty. */
    public static ServiceJobResponse summary(ServiceJob job, String registryId) {
        return detail(job, registryId, List.of(), List.of(), List.of());
    }

    public static ServiceJobResponse detail(ServiceJob job,
                                            String registryId,
                                            List<ServiceJobEvent> events,
                                            List<ServiceJobItem> items,
                                            List<QcInspection> inspections) {
        return new ServiceJobResponse(
                job.getId(),
                registryId,
                job.getRiderId(),
                job.getSource(),
                job.getDamageCategory(),
                job.getQueue(),
                job.getLocation(),
                job.getReference(),
                job.getWorkSummary(),
                events.stream().map(ServiceJobEventResponse::from).toList(),
                inspections.stream().map(QcInspectionResponse::from).toList(),
                job.getDamageNotes(),
                items.stream().map(ServiceJobItemResponse::from).toList(),
                job.getTotalCostPaise(),
                job.getLiability(),
                job.getStatus(),
                job.getTechnician(),
                job.getCreatedOn(),
                job.getClosedOn(),
                job.getUpdatedOn());
    }
}
