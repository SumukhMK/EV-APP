package com.evrental.common;

import java.util.Map;

/**
 * 422 with a field attached — a rule the annotations cannot express, such as a
 * closing date before an opening one. Bean-validation failures do not come
 * through here; GlobalExceptionHandler turns those into the same body.
 */
public class ValidationException extends RuntimeException {

    private final String field;
    private final Map<String, Object> details;

    public ValidationException(String field, String message) {
        this(field, message, null);
    }

    /** With facts a screen can act on, such as {@code code}; sent as the body's {@code details}. */
    public ValidationException(String field, String message, Map<String, Object> details) {
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
