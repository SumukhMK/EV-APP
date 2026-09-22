package com.evrental.common;

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
