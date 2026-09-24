package com.evrental.common;

/**
 * One chip above a list: the value it filters to, its label, and how many rows
 * carry it. Mirrors Facet<V> in frontend/app/src/types/common.ts, where the
 * value may also be the literal "ALL".
 *
 * <p>In common rather than in vehicle: riders and service jobs show the same
 * chip row, and a second copy of this record would drift from the first.
 */
public record Facet<V>(V value, String label, long count) {
}
