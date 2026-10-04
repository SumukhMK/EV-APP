package com.evrental.vehicle;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The induction date as a person typed it.
 *
 * <p>Only ISO was accepted before, so a file whose author wrote 01/09/2026
 * — the way an Indian operations team does — had every row rejected. Day
 * comes first in every slashed, dashed and dotted form here; this is not a
 * US product, and guessing the order per row would import the wrong date
 * silently, which is worse than rejecting it. Resolution is strict, so the
 * 31st of February is not quietly the 3rd of March.
 */
final class ImportDates {

    /** Shown in the row error, so the operator sees two shapes that work. */
    static final String HINT = "2026-09-01 or 01/09/2026";

    private static final List<DateTimeFormatter> FORMATS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            strict("uuuu/M/d"),
            strict("d/M/uuuu"),
            strict("d-M-uuuu"),
            strict("d.M.uuuu"),
            strict("d-MMM-uuuu"),
            strict("d MMM uuuu"),
            strict("d MMMM uuuu"));

    private ImportDates() {
    }

    static Optional<LocalDate> parse(String text) {
        if (text == null) {
            return Optional.empty();
        }
        String value = text.trim();
        if (value.isEmpty()) {
            return Optional.empty();
        }
        // "2026-09-01 00:00:00": a database dump or an Excel cell that carried
        // a time. The date is what the fleet records.
        if (value.length() > 10 && (value.charAt(10) == 'T' || value.charAt(10) == ' ')) {
            try {
                return Optional.of(LocalDateTime.parse(value.replace(' ', 'T')).toLocalDate());
            } catch (DateTimeParseException ignored) {
                // Not a timestamp either; fall through to the date formats.
            }
        }
        for (DateTimeFormatter format : FORMATS) {
            try {
                return Optional.of(LocalDate.parse(value, format));
            } catch (DateTimeParseException ignored) {
                // Try the next shape.
            }
        }
        return Optional.empty();
    }

    private static DateTimeFormatter strict(String pattern) {
        return new DateTimeFormatterBuilder()
                .parseCaseInsensitive()
                .appendPattern(pattern)
                .toFormatter(Locale.ENGLISH)
                .withResolverStyle(ResolverStyle.STRICT);
    }
}
