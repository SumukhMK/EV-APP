package com.evrental.vehicle;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Finds the header row in a spreadsheet and names its columns.
 *
 * <p>The files that arrive are not the template. A hub's export has a title
 * row and a "Generated on" line before the header; the column is "Chassis
 * Number" or "Reg No" rather than {@code chassisNumber}; Excel glues a
 * byte-order mark onto the first header of a CSV. The parser used to demand
 * the exact template spelling in row one and reject everything else one
 * missing column at a time. This class absorbs that variation in one place
 * so the rows downstream never see it.
 *
 * <p>Matching is in two steps. A header is <em>normalised</em> — lower-cased,
 * every character that is not a letter or digit removed — so that case,
 * spaces, underscores, dots and the BOM stop mattering. The normalised form
 * is then looked up in {@link #ALIASES}, a short list of what fleets actually
 * call each field. The list is deliberately conservative: "Depot" is not a
 * synonym for hub because in some operations it is a service yard, and a
 * wrong guess imports 150 bikes into the wrong place.
 */
final class HeaderMatcher {

    /** The fields a row carries, in template order. */
    static final List<String> COLUMNS = List.of(
            "id", "chassisNumber", "model", "batteryType",
            "batteryVendor", "hub", "registrationNumber", "inductedOn");

    /** How many rows from the top may be title, blank or notes before the header. */
    static final int SCAN_ROWS = 10;

    /** Normalised header → canonical field. The canonical names are in here too. */
    private static final Map<String, String> ALIASES = Map.ofEntries(
            alias("id", "id", "vehicleid", "vehicle", "registryid", "registry", "regid",
                    "bikeid", "fleetid", "assetid", "vehiclecode"),
            alias("chassisNumber", "chassisnumber", "chassisno", "chassis", "chassisnum",
                    "vin", "framenumber", "frameno"),
            alias("model", "model", "vehiclemodel", "bikemodel", "modelname", "makemodel"),
            alias("batteryType", "batterytype", "battery", "batterytech", "batterychemistry"),
            alias("batteryVendor", "batteryvendor", "batterymake", "batterybrand",
                    "batterysupplier", "batterymanufacturer", "vendor"),
            alias("hub", "hub", "hubname", "station", "branch", "location"),
            alias("registrationNumber", "registrationnumber", "registrationno", "regno",
                    "regnumber", "registration", "numberplate", "plate", "platenumber",
                    "licenseplate", "licenceplate", "rcnumber", "vehicleregistration",
                    "vehiclenumber", "vehicleno"),
            alias("inductedOn", "inductedon", "inducted", "inductiondate", "inducteddate",
                    "dateinducted", "dateofinduction", "onboardedon", "onboardingdate",
                    "dateadded", "addedon", "joineddate"))
            .entrySet().stream()
            .flatMap(e -> e.getValue().stream().map(a -> Map.entry(a, e.getKey())))
            .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), Map::putAll);

    private HeaderMatcher() {
    }

    /**
     * Scans the first {@link #SCAN_ROWS} rows for the one naming the most
     * known columns, and maps every field to a column index.
     *
     * @throws ImportFileException when no row looks like a header, when a
     *         field is missing, or when two headers name the same field —
     *         with the message naming every problem of its kind at once
     */
    static HeaderMatch locate(List<List<String>> records) {
        int headerRow = -1;
        int best = 0;
        for (int r = 0; r < Math.min(records.size(), SCAN_ROWS); r++) {
            int known = (int) records.get(r).stream()
                    .map(HeaderMatcher::canonical)
                    .filter(Objects::nonNull)
                    .distinct()
                    .count();
            if (known > best) {
                best = known;
                headerRow = r;
            }
        }
        if (headerRow < 0) {
            throw new ImportFileException(
                    "No header row found. The first row should name the columns: "
                            + String.join(", ", COLUMNS)
                            + ". Download the template to start from the right columns.",
                    Map.of("expectedColumns", COLUMNS));
        }

        List<String> header = records.get(headerRow);
        Map<String, Integer> columns = new LinkedHashMap<>();
        Map<String, String> spelledAs = new LinkedHashMap<>();
        List<String> found = new ArrayList<>();
        List<String> ignored = new ArrayList<>();
        for (int c = 0; c < header.size(); c++) {
            String raw = display(header.get(c));
            if (raw.isEmpty()) {
                continue;
            }
            found.add(raw);
            String field = canonical(raw);
            if (field == null) {
                ignored.add(raw);
            } else if (columns.containsKey(field)) {
                throw new ImportFileException(
                        "The " + field + " column appears twice, as \"" + spelledAs.get(field)
                                + "\" and \"" + raw + "\". Keep one.",
                        Map.of("duplicateColumn", field, "foundColumns", found));
            } else {
                columns.put(field, c);
                spelledAs.put(field, raw);
            }
        }

        List<String> missing = COLUMNS.stream().filter(f -> !columns.containsKey(f)).toList();
        if (!missing.isEmpty()) {
            throw new ImportFileException(
                    "Could not find these columns: " + String.join(", ", missing)
                            + ". Columns in your file: " + String.join(", ", found)
                            + ". Download the template to start from the right columns.",
                    Map.of("missingColumns", missing,
                            "foundColumns", found,
                            "expectedColumns", COLUMNS));
        }
        return new HeaderMatch(headerRow, columns, ignored);
    }

    /** The field a header names, or null when it names nothing we import. */
    static String canonical(String header) {
        return header == null ? null : ALIASES.get(normalise(header));
    }

    /** Lower-case letters and digits only: "Reg. No" and "﻿REG_NO" both become "regno". */
    static String normalise(String header) {
        return header.replaceAll("[^\\p{L}\\p{N}]", "").toLowerCase(Locale.ROOT);
    }

    /** The header as the file spells it, minus the BOM and surrounding space. */
    private static String display(String header) {
        return header == null ? "" : header.replace("﻿", "").trim();
    }

    private static Map.Entry<String, List<String>> alias(String field, String... normalisedNames) {
        return Map.entry(field, List.of(normalisedNames));
    }
}
