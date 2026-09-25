package com.evrental.service;

import java.time.Instant;
import java.util.Map;

/** One QC attempt, as the job detail screen lists it. */
public record QcInspectionResponse(
        Instant inspectedOn,
        String inspector,
        Map<String, Boolean> checks,
        boolean passed,
        String notes) {

    public static QcInspectionResponse from(QcInspection inspection) {
        return new QcInspectionResponse(
                inspection.getInspectedOn(), inspection.getInspector(),
                inspection.getChecks(), inspection.isPassed(), inspection.getNotes());
    }
}
