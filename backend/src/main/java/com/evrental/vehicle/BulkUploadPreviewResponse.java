package com.evrental.vehicle;

import java.util.List;

public record BulkUploadPreviewResponse(
        String importId,
        String fileName,
        int totalRows,
        int validRows,
        int errorRows,
        List<BulkUploadRowResponse> rows) {
}
