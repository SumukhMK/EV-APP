package com.evrental.common;

/**
 * 422 with a field attached — a rule the annotations cannot express, such as a
 * closing date before an opening one. Bean-validation failures do not come
 * through here; GlobalExceptionHandler turns those into the same body.
 */
public class ValidationException extends RuntimeException {

    private final String field;

    public ValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String field() {
        return field;
    }
}
