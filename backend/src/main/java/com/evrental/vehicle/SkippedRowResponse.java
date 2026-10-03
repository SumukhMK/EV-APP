package com.evrental.vehicle;

/**
 * A row the preview said would import and the commit then could not.
 *
 * <p>These are rows that went stale between the two steps — most often
 * because the bike was created by someone else while the preview sat on
 * screen. They used to be skipped with a bare {@code continue}, so the
 * imported count came back lower than the preview promised and nothing said
 * which row was missing or why.
 */
public record SkippedRowResponse(int rowNumber, String id, String error) {

    static SkippedRowResponse of(VehicleImportRow row, String error) {
        return new SkippedRowResponse(row.getRowNumber(), row.getPayload().get("id"), error);
    }
}
