package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.payment.BillingClock;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.ObjectMapper;

/**
 * The files a hub actually sends, through the real endpoint.
 *
 * <p>The unit tests on HeaderMatcher, ImportDates and ImportFileReader prove
 * each piece; these prove the pieces are wired, that the response carries
 * what the screen lays out, and that the two rules the service itself owns
 * — the row cap and the preview's age — hold.
 */
class VehicleImportEdgeCasesTest extends VehicleTestBase {

    private static final String TEMPLATE_HEADER =
            "id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn\n";

    private final ObjectMapper objectMapper = new ObjectMapper();

    // --- headers, end to end -------------------------------------------------

    /** A BOM, a title row, a blank row, human column names and a day-first date, all in one file. */
    @Test
    void aHubsOwnExportPreviewsCleanly() throws Exception {
        String file = "﻿Fleet export - Koramangala\n\n"
                + "Vehicle ID,Chassis Number,Model,Battery Type,Battery Vendor,Hub,Registration Number,Induction Date\n"
                + "BLRSS0950,SESEAG03202300950,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0950,01/09/2026\n";

        mvc.perform(upload(csv(file)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(1))
                .andExpect(jsonPath("$.validRows").value(1))
                .andExpect(jsonPath("$.rows[0].id").value("BLRSS0950"))
                .andExpect(jsonPath("$.rows[0].error").doesNotExist());
    }

    @Test
    void missingColumnsAre422WithTheDetailsTheScreenLaysOut() throws Exception {
        String file = "Vehicle ID,Chassis Number,Model,Battery Type,Battery Vendor,Depot,Registration Number,Notes\n"
                + "BLRSS0951,SESEAG03202300951,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0951,-\n";

        mvc.perform(upload(csv(file)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("file"))
                .andExpect(jsonPath("$.message").value(startsWith("Could not find these columns: hub, inductedOn")))
                .andExpect(jsonPath("$.details.missingColumns[0]").value("hub"))
                .andExpect(jsonPath("$.details.missingColumns[1]").value("inductedOn"))
                .andExpect(jsonPath("$.details.foundColumns[0]").value("Vehicle ID"))
                .andExpect(jsonPath("$.details.foundColumns[5]").value("Depot"))
                .andExpect(jsonPath("$.details.expectedColumns[7]").value("inductedOn"));
    }

    @Test
    void aSemicolonSeparatedCsvIsRead() throws Exception {
        String file = TEMPLATE_HEADER.replace(',', ';')
                + "BLRSS0952;SESEAG03202300952;Eagle 2;Yuma;Yuma;Koramangala;KA01AA0952;2026-09-01\n";

        mvc.perform(upload(csv(file)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1));
    }

    @Test
    void anOldBinaryXlsIsAccepted() throws Exception {
        byte[] bytes = workbook(new HSSFWorkbook(), "Vehicles", sheet -> {
            row(sheet, 0, TEMPLATE_HEADER.trim().split(","));
            row(sheet, 1, "BLRSS0953", "SESEAG03202300953", "Eagle 2", "Yuma", "Yuma", "Koramangala", "KA01AA0953", "2026-09-01");
        });

        mvc.perform(upload(new MockMultipartFile("file", "fleet.xls", "application/vnd.ms-excel", bytes)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1));
    }

    // --- the preview says where the rows came from ----------------------------

    @Test
    void thePreviewNamesTheSheetAndTheColumnsItIgnored() throws Exception {
        byte[] bytes = workbook(new XSSFWorkbook(), "Fleet", sheet -> {
            row(sheet, 0, "id", "chassisNumber", "model", "batteryType", "batteryVendor",
                    "hub", "registrationNumber", "inductedOn", "Notes", "Colour");
            row(sheet, 1, "BLRSS0954", "SESEAG03202300954", "Eagle 2", "Yuma", "Yuma", "Koramangala",
                    "KA01AA0954", "2026-09-01", "second-hand", "red");
        });

        mvc.perform(upload(xlsx(bytes)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sheetName").value("Fleet"))
                .andExpect(jsonPath("$.ignoredColumns[0]").value("Notes"))
                .andExpect(jsonPath("$.ignoredColumns[1]").value("Colour"));
    }

    @Test
    void aCsvHasNoSheetName() throws Exception {
        mvc.perform(upload(csv(TEMPLATE_HEADER
                        + "BLRSS0955,SESEAG03202300955,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0955,2026-09-01\n")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sheetName").doesNotExist())
                .andExpect(jsonPath("$.ignoredColumns").isEmpty());
    }

    // --- dates -------------------------------------------------------------------

    @Test
    void aDayFirstDateIsImportedAsThatDate() throws Exception {
        String importId = stage(TEMPLATE_HEADER
                + "BLRSS0956,SESEAG03202300956,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0956,01/09/2026\n");

        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(1));

        LocalDate inducted = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT inducted_on FROM vehicles WHERE registry_id = 'BLRSS0956'", LocalDate.class));
        assertThat(inducted).isEqualTo(LocalDate.of(2026, 9, 1));
    }

    @Test
    void anInductionDateInTheFutureIsAnErrorRow() throws Exception {
        LocalDate nextMonth = LocalDate.now(BillingClock.ZONE).plusMonths(1);

        mvc.perform(upload(csv(TEMPLATE_HEADER
                        + "BLRSS0957,SESEAG03202300957,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0957," + nextMonth + "\n")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorRows").value(1))
                .andExpect(jsonPath("$.rows[0].error").value("inductedOn cannot be in the future"));
    }

    @Test
    void todayIsNotTheFuture() throws Exception {
        LocalDate today = LocalDate.now(BillingClock.ZONE);

        mvc.perform(upload(csv(TEMPLATE_HEADER
                        + "BLRSS0958,SESEAG03202300958,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0958," + today + "\n")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1));
    }

    @Test
    void anUnreadableDateNamesTheShapesThatWork() throws Exception {
        mvc.perform(upload(csv(TEMPLATE_HEADER
                        + "BLRSS0959,SESEAG03202300959,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0959,Sept 1st\n")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].error")
                        .value("inductedOn must be a date like 2026-09-01 or 01/09/2026"));
    }

    /** The same identity rules as the single-add endpoint, as row errors. */
    @Test
    void anIdWithSpacesOrARegistrationWithSymbolsIsAnErrorRow() throws Exception {
        mvc.perform(upload(csv(TEMPLATE_HEADER
                        + "BLR SS-0963,SESEAG03202300963,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0963,2026-09-01\n"
                        + "BLRSS0964,SESEAG03202300964,Eagle 2,Yuma,Yuma,Koramangala,KA01#0964,2026-09-01\n")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorRows").value(2))
                .andExpect(jsonPath("$.rows[0].error").value("id must be letters and digits only"))
                .andExpect(jsonPath("$.rows[1].error").value("registrationNumber must be letters, digits, spaces or hyphens"));
    }

    /** The same 17-character rule the single-add form and endpoint apply, as a row error. */
    @Test
    void aChassisThatIsNotSeventeenCharactersIsAnErrorRow() throws Exception {
        mvc.perform(upload(csv(TEMPLATE_HEADER
                        + "BLRSS0962,SHORT962,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0962,2026-09-01\n")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorRows").value(1))
                .andExpect(jsonPath("$.rows[0].error").value("chassisNumber must be exactly 17 letters and digits"));
    }

    // --- size --------------------------------------------------------------------

    @Test
    void moreThanTwoThousandRowsIsRejectedBeforeAnythingIsStaged() throws Exception {
        int before = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicle_imports WHERE tenant_id = ?", Integer.class, TENANT));

        // "More than": the reader stops at the cap rather than counting a
        // file it will refuse anyway, so the exact total is unknown by design.
        mvc.perform(upload(csv(rows(2001))))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message")
                        .value("The file has more than 2,000 rows. The maximum is 2,000 — split it into smaller files."))
                .andExpect(jsonPath("$.details.maxRows").value(2000));

        int after = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicle_imports WHERE tenant_id = ?", Integer.class, TENANT));
        assertThat(after).isEqualTo(before);
    }

    @Test
    void exactlyTwoThousandRowsIsAccepted() throws Exception {
        mvc.perform(upload(csv(rows(2000))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(2000));
    }

    /** Excel's full width. Read in bounded memory; the surplus columns are simply not imported. */
    @Test
    void aSheetAsWideAsExcelAllowsIsPreviewedNotFatal() throws Exception {
        byte[] bytes;
        try (org.apache.poi.xssf.streaming.SXSSFWorkbook wb = new org.apache.poi.xssf.streaming.SXSSFWorkbook(50);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Vehicles");
            String[] header = TEMPLATE_HEADER.trim().split(",");
            Row h = sheet.createRow(0);
            for (int c = 0; c < 16_384; c++) {
                h.createCell(c).setCellValue(c < header.length ? header[c] : "extra" + c);
            }
            String[] values = {"BLRSS0961", "SESEAG03202300961", "Eagle 2", "Yuma", "Yuma", "Koramangala", "KA01AA0961", "2026-09-01"};
            Row r = sheet.createRow(1);
            for (int c = 0; c < 16_384; c++) {
                r.createCell(c).setCellValue(c < values.length ? values[c] : "x");
            }
            wb.write(out);
            wb.dispose();
            bytes = out.toByteArray();
        }

        mvc.perform(upload(xlsx(bytes)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1));
    }

    @Test
    void anUploadWithoutAFileIs400() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Choose a file to upload"));
    }

    // --- age ---------------------------------------------------------------------

    /** The sweeper runs once a night; a preview must not be committable in the gap. */
    @Test
    void aPreviewOlderThanADayCannotBeCommittedEvenBeforeTheSweepRuns() throws Exception {
        String importId = stage(TEMPLATE_HEADER
                + "BLRSS0960,SESEAG03202300960,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0960,2026-09-01\n");
        superAdmin(jdbc -> jdbc.update(
                "UPDATE vehicle_imports SET uploaded_on = now() - interval '25 hours' WHERE id = ?::uuid", importId));

        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This preview has expired. Upload the file again."));

        Integer imported = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicles WHERE registry_id = 'BLRSS0960'", Integer.class));
        assertThat(imported).isZero();
    }

    // --- plumbing -------------------------------------------------------------------

    private org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder upload(
            MockMultipartFile file) throws Exception {
        return multipart("/api/v1/vehicles/imports")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL));
    }

    private String stage(String csv) throws Exception {
        MvcResult result = mvc.perform(upload(csv(csv)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("importId").asString();
    }

    private static String rows(int count) {
        StringBuilder sb = new StringBuilder(TEMPLATE_HEADER);
        for (int i = 1; i <= count; i++) {
            sb.append(String.format("BULK%05d,SESEAG032023%05d,Eagle 2,Yuma,Yuma,Koramangala,KA01BK%04d,2026-09-01%n",
                    i, i, i % 10000));
        }
        return sb.toString();
    }

    private static MockMultipartFile csv(String content) {
        return new MockMultipartFile("file", "vehicles.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
    }

    private static MockMultipartFile xlsx(byte[] content) {
        return new MockMultipartFile("file", "fleet.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content);
    }

    private static byte[] workbook(Workbook wb, String sheetName, java.util.function.Consumer<Sheet> build)
            throws Exception {
        try (wb; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            build.accept(wb.createSheet(sheetName));
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static void row(Sheet sheet, int index, String... values) {
        Row row = sheet.createRow(index);
        for (int c = 0; c < values.length; c++) {
            row.createCell(c).setCellValue(values[c]);
        }
    }
}
