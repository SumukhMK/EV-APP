package com.evrental.common;

/** 404. The row does not exist — or does not exist for this tenant, which RLS makes the same thing. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public static NotFoundException of(String what, Object id) {
        return new NotFoundException(what + " " + id + " not found");
    }
}
