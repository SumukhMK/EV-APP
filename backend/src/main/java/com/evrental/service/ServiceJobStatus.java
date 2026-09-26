package com.evrental.service;

/**
 * Where a job is in its own life, matching ServiceJobStatus in
 * frontend/app/src/types/serviceJob.ts.
 *
 * <p>Distinct from the queue: the queue says where the bike is, the status says
 * whether anyone has touched the job yet and whether it is finished. A job can
 * move through five queues and still be IN_PROGRESS.
 */
public enum ServiceJobStatus {
    /** Opened, nobody has worked it yet. */
    OPEN,
    /** Someone has updated it at least once. */
    IN_PROGRESS,
    /** Finished: liability decided, cost frozen. Nothing changes after this. */
    CLOSED
}
