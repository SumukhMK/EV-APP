package com.evrental.common;

/**
 * 409. The request is well-formed but the current state forbids it: an invalid
 * vehicle state transition, a second open service job on one bike, two people
 * deboarding the same rider. The UI has a specific message for this status
 * (docs/BUILD.md H6), so it must not be flattened into a 400.
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
