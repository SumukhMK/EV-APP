package com.evrental.common;

// jackson-annotations is the one package that did NOT move in Jackson 3:
// it stays on com.fasterxml.jackson.annotation so one copy serves both
// Jackson 2 and Jackson 3 code on the same classpath (see the official
// MIGRATING_TO_JACKSON_3.md). Only databind classes moved to tools.jackson.
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * The one error body this API ever returns.
 *
 * <p>Shaped to match {@code ApiError} in frontend/app/src/lib/api/client.ts:
 * the UI reads {@code status} to decide whether a failure is recoverable, and
 * {@code field} to attach the message to one React Hook Form input instead of
 * a banner. {@code field} is omitted, not null, when the failure is not about
 * one field.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiErrorResponse(String message, int status, String field) {

    public ApiErrorResponse(String message, int status) {
        this(message, status, null);
    }
}
