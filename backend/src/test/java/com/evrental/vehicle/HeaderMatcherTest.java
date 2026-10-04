package com.evrental.vehicle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Finding the header row in whatever a hub actually sends, tested without
 * Spring or a file: the matcher takes rows of text and answers where the
 * header is and which column holds which field.
 *
 * <p>The spreadsheets that arrive are not the template. They have a title
 * row, a column called "Chassis Number" or "Reg No", a byte-order mark glued
 * to the first header by Excel, and a "Notes" column nobody asked for. Each
 * of those used to be a rejected file; each is a case here.
 */
class HeaderMatcherTest {

    private static final List<String> TEMPLATE = List.of(
            "id", "chassisNumber", "model", "batteryType",
            "batteryVendor", "hub", "registrationNumber", "inductedOn");

    @Test
    void theTemplateHeaderMapsEveryColumnToItsPosition() {
        HeaderMatch match = HeaderMatcher.locate(List.of(TEMPLATE, row("BLRSS0001")));

        assertThat(match.headerRow()).isZero();
        assertThat(match.columns()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "id", 0, "chassisNumber", 1, "model", 2, "batteryType", 3,
                "batteryVendor", 4, "hub", 5, "registrationNumber", 6, "inductedOn", 7));
        assertThat(match.ignored()).isEmpty();
    }

    @Test
    void humanHeaderNamesAreRecognised() {
        List<String> header = List.of(
                "Vehicle ID", "Chassis Number", "Model", "Battery Type",
                "Battery Vendor", "Hub", "Registration Number", "Induction Date");

        HeaderMatch match = HeaderMatcher.locate(List.of(header, row("BLRSS0001")));

        assertThat(match.columns().keySet()).containsExactlyInAnyOrderElementsOf(TEMPLATE);
        assertThat(match.columns()).containsEntry("inductedOn", 7).containsEntry("registrationNumber", 6);
    }

    /** Case, underscores, a stray space and Excel's BOM on the first cell. */
    @Test
    void caseSpacingPunctuationAndTheByteOrderMarkDoNotMatter() {
        List<String> header = List.of(
                "﻿ID", "chassis_number", "MODEL ", "battery type",
                "battery_vendor", "HUB", "Reg. No", "inducted_on");

        HeaderMatch match = HeaderMatcher.locate(List.of(header, row("BLRSS0001")));

        assertThat(match.columns().keySet()).containsExactlyInAnyOrderElementsOf(TEMPLATE);
    }

    /** A real export: a title, a blank line, a generated-on line, then the header. */
    @Test
    void titleRowsAboveTheHeaderAreSkipped() {
        HeaderMatch match = HeaderMatcher.locate(List.of(
                List.of("Fleet export - Koramangala"),
                List.of(""),
                List.of("Generated", "2026-10-01"),
                TEMPLATE,
                row("BLRSS0001")));

        assertThat(match.headerRow()).isEqualTo(3);
        assertThat(match.columns()).containsEntry("id", 0);
    }

    /** Every missing column at once, and what was there instead. */
    @Test
    void everyMissingColumnIsNamedTogetherWithTheColumnsFound() {
        List<String> header = List.of("Vehicle ID", "Chassis Number", "Model", "Battery Type",
                "Battery Vendor", "Depot", "Registration Number", "Notes");

        assertThatThrownBy(() -> HeaderMatcher.locate(List.of(header, row("BLRSS0001"))))
                .isInstanceOf(ImportFileException.class)
                .hasMessageContaining("Could not find these columns: hub, inductedOn")
                .hasMessageContaining("Columns in your file: Vehicle ID, Chassis Number")
                .satisfies(ex -> {
                    ImportFileException file = (ImportFileException) ex;
                    assertThat(file.details()).containsEntry("missingColumns", List.of("hub", "inductedOn"));
                    assertThat(file.details()).containsEntry("foundColumns", header);
                });
    }

    @Test
    void hubIsAcceptedUnderItsCommonSynonymsButNotDepot() {
        // "Depot" is deliberately not a synonym: in some fleets it is a hub and
        // in others a service yard. The operator renames it; we do not guess.
        assertThatThrownBy(() -> HeaderMatcher.locate(List.of(
                List.of("id", "chassisNumber", "model", "batteryType", "batteryVendor",
                        "Depot", "registrationNumber", "inductedOn"))))
                .isInstanceOf(ImportFileException.class)
                .hasMessageContaining("Could not find these columns: hub");

        HeaderMatch match = HeaderMatcher.locate(List.of(
                List.of("id", "chassisNumber", "model", "batteryType", "batteryVendor",
                        "Hub Name", "registrationNumber", "inductedOn")));
        assertThat(match.columns()).containsEntry("hub", 5);
    }

    @Test
    void twoHeadersForTheSameColumnAreRejectedByName() {
        List<String> header = List.of("ID", "Vehicle ID", "chassisNumber", "model", "batteryType",
                "batteryVendor", "hub", "registrationNumber", "inductedOn");

        assertThatThrownBy(() -> HeaderMatcher.locate(List.of(header)))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("The id column appears twice, as \"ID\" and \"Vehicle ID\". Keep one.");
    }

    @Test
    void unknownColumnsAreIgnoredAndReportedAsSuch() {
        List<String> header = List.of("id", "chassisNumber", "model", "batteryType",
                "batteryVendor", "hub", "registrationNumber", "inductedOn", "Notes", "Colour");

        HeaderMatch match = HeaderMatcher.locate(List.of(header));

        assertThat(match.ignored()).containsExactly("Notes", "Colour");
    }

    @Test
    void aFileWithNoRecognisableHeaderSaysSo() {
        assertThatThrownBy(() -> HeaderMatcher.locate(List.of(
                List.of("Alpha", "Beta", "Gamma"),
                List.of("1", "2", "3"))))
                .isInstanceOf(ImportFileException.class)
                .hasMessageStartingWith("No header row found.");
    }

    /** The header is the row with the most known columns, not the first with any. */
    @Test
    void aTitleRowThatHappensToContainOneKnownWordIsNotTheHeader() {
        HeaderMatch match = HeaderMatcher.locate(List.of(
                List.of("Hub", "Koramangala"),
                TEMPLATE,
                row("BLRSS0001")));

        assertThat(match.headerRow()).isEqualTo(1);
    }

    private static List<String> row(String id) {
        return List.of(id, "CH-1", "Eagle 2", "Yuma", "Yuma", "Koramangala", "KA01AA0001", "2026-09-01");
    }
}
