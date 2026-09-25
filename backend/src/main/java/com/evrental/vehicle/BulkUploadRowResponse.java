package com.evrental.vehicle;

import java.util.Map;

public record BulkUploadRowResponse(
        int rowNumber,
        String id,
        String chassisNumber,
        String model,
        String error) {

    public static BulkUploadRowResponse from(VehicleImportRow row) {
        Map<String, String> payload = row.getPayload();
        return new BulkUploadRowResponse(
                row.getRowNumber(),
                payload.get("id"),
                payload.get("chassisNumber"),
                payload.get("model"),
                row.getError());
    }
}
