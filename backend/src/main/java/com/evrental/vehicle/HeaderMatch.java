package com.evrental.vehicle;

import java.util.List;
import java.util.Map;

/**
 * Where the header row is and which column holds which field.
 *
 * @param headerRow index of the header within the rows that were scanned
 * @param columns   canonical field name → column index in every row
 * @param ignored   header names that matched nothing and are skipped, as the
 *                  file spells them, so the preview can say so
 */
record HeaderMatch(int headerRow, Map<String, Integer> columns, List<String> ignored) {
}
