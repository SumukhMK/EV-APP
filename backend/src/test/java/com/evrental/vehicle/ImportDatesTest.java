package com.evrental.vehicle;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The ways a person writes the induction date, read as that date.
 *
 * <p>Only ISO was accepted before, which rejected every row of a file whose
 * author typed 01/09/2026 the way an Indian operations team does. Day comes
 * first in every slashed or dotted form here — this is not a US product,
 * and guessing per row would import the wrong date silently, which is worse
 * than rejecting it.
 */
class ImportDatesTest {

    private static final LocalDate FIRST_SEPT = LocalDate.of(2026, 9, 1);

    @ParameterizedTest
    @ValueSource(strings = {
            "2026-09-01",
            "2026/09/01",
            "01/09/2026",
            "1/9/2026",
            "01-09-2026",
            "01.09.2026",
            "01-Sep-2026",
            "1 Sep 2026",
            "01 September 2026",
            " 2026-09-01 ",
    })
    void everyCommonSpellingIsTheSameDate(String text) {
        assertThat(ImportDates.parse(text)).contains(FIRST_SEPT);
    }

    /** Excel exports and database dumps carry a midnight time. The date is what counts. */
    @ParameterizedTest
    @ValueSource(strings = {"2026-09-01T00:00:00", "2026-09-01 00:00:00", "2026-09-01T00:00"})
    void aMidnightTimestampIsItsDate(String text) {
        assertThat(ImportDates.parse(text)).contains(FIRST_SEPT);
    }

    @Test
    void slashedDatesAreDayFirst() {
        assertThat(ImportDates.parse("09/01/2026")).contains(LocalDate.of(2026, 1, 9));
    }

    @ParameterizedTest
    @ValueSource(strings = {"31/02/2026", "2026-13-01", "01/09/26", "20260901", "September", "", "   ", "tomorrow"})
    void anythingElseIsNotADate(String text) {
        assertThat(ImportDates.parse(text)).isEmpty();
    }

    @Test
    void nullIsNotADate() {
        assertThat(ImportDates.parse(null)).isEmpty();
    }
}
