package com.evrental.common;

import java.util.Map;

/**
 * 409. The request is well-formed but the current state forbids it: an invalid
 * vehicle state transition, a second open service job on one bike, two people
 * deboarding the same rider. The UI has a specific message for this status
 * (docs/BUILD.md H6), so it must not be flattened into a 400.
 */
public class ConflictException extends RuntimeException {

    private final String field;
    private final Map<String, Object> details;

    public ConflictException(String message) {
        this(message, null);
    }

    public ConflictException(String message, String field) {
        this(message, field, null);
    }

    /** With facts a screen can act on, such as {@code code}; sent as the body's {@code details}. */
    public ConflictException(String message, String field, Map<String, Object> details) {
        super(message);
        this.field = field;
        this.details = details;
    }

    public Map<String, Object> details() {
        return details;
    }

    public String field() {
        return field;
    }
}
