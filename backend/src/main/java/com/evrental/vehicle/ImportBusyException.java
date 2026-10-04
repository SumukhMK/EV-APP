package com.evrental.vehicle;

/**
 * 503: too many files are being checked at once.
 *
 * <p>Parsing is the one request whose memory is set by the caller's file
 * rather than by the database, so the service lets only a couple run at a
 * time and asks the rest to wait a moment. A fleet of one operator never
 * sees this; it exists so that five uploads at once cannot add up to what
 * one upload alone is bounded against.
 */
public class ImportBusyException extends RuntimeException {

    public ImportBusyException() {
        super("Other files are being checked right now. Try again in a minute.");
    }
}
