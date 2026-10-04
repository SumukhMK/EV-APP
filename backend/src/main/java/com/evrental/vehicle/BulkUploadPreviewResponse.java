package com.evrental.vehicle;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * What the file would import, before anything does.
 *
 * @param sheetName      the worksheet the rows came from, so an operator who
 *                       meant a different one finds out here; absent for CSV
 * @param ignoredColumns header names in the file that matched no field and
 *                       were skipped — shown, because a silently dropped
 *                       column is how a "Notes" column full of registration
 *                       numbers goes unnoticed
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record BulkUploadPreviewResponse(
        String importId,
        String fileName,
        String sheetName,
        List<String> ignoredColumns,
        int totalRows,
        int validRows,
        int errorRows,
        List<BulkUploadRowResponse> rows) {
}
