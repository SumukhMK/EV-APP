package com.evrental.assignment;

/**
 * The rider currently on a bike, as the vehicle module prints it. Null-safe:
 * a bike with no open assignment has no rider, and the caller maps null to
 * null rather than inventing an empty row.
 */
public record CurrentRider(String id, String name) {
}