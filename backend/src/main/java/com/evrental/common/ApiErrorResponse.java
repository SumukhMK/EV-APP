package com.evrental.common;

// jackson-annotations is the one package that did NOT move in Jackson 3:
// it stays on com.fasterxml.jackson.annotation so one copy serves both
// Jackson 2 and Jackson 3 code on the same classpath (see the official
// MIGRATING_TO_JACKSON_3.md). Only databind classes moved to tools.jackson.
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/**
 * The one error body this API ever returns.
 *
 * <p>Shaped to match {@code ApiError} in frontend/app/src/lib/api/client.ts:
 * the UI reads {@code status} to decide whether a failure is recoverable, and
 * {@code field} to attach the message to one React Hook Form input instead of
 * a banner. {@code field} is omitted, not null, when the failure is not about
 * one field.
 *
 * <p>{@code details} is the rare extra: structured facts behind a message
 * that a screen can lay out better than a sentence — the columns a
 * spreadsheet was missing, say. The message always stands on its own; a
 * client that ignores details loses nothing but layout.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiErrorResponse(String message, int status, String field, Map<String, Object> details) {

    public ApiErrorResponse(String message, int status) {
        this(message, status, null, null);
    }

    public ApiErrorResponse(String message, int status, String field) {
        this(message, status, field, null);
    }
}
