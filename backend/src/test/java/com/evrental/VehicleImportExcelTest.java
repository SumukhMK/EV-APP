package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.List;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/**
 * The upload screen has always said ".xlsx or .csv", and the operations team
 * works in Excel. These tests are the .xlsx half of that promise, through the
 * same endpoint and the same validation as a CSV — the file format is a
 * detail of parsing and must not change a single rule.
 *
 * <p>The awkward cases are the ones a real export produces, not the ones a
 * hand-written fixture does: a date cell holds a numeric serial rather than
 * the text the user typed, a registry id Excel decided was a number loses its
 * formatting, and the sheet reports a used range well past the last row a
 * person filled in.
 */
class VehicleImportExcelTest extends VehicleTestBase {

    private static final List<String> HEADERS = List.of(
            "id", "chassisNumber", "model", "batteryType",
            "batteryVendor", "hub", "registrationNumber", "inductedOn");

    @Test
    void anExcelUploadPreviewsLikeTheEquivalentCsv() throws Exception {
        byte[] workbook = workbook(sheet -> {
            header(sheet);
            textRow(sheet, 1, "BLRSS0801", "CH-801", "Eagle 2", "Yuma",
                    "Yuma", "Koramangala", "KA01AA0801", "2026-09-01");
            textRow(sheet, 2, "BLRSS0802", "CH-802", "Eagle 2", "Yuma",
                    "Yuma", "Koramangala", "KA01AA0802", "2026-09-01");
        });

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(xlsx("fleet.xlsx", workbook))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(2))
                .andExpect(jsonPath("$.validRows").value(2))
                .andExpect(jsonPath("$.errorRows").value(0));
    }

    /**
     * The case that makes hand-rolled XML parsing wrong: a user picks a date
     * from Excel's picker and the cell holds 46266, not "2026-09-01".
     */
    @Test
    void aRealDateCellIsReadAsTheDateTheUserPicked() throws Exception {
        byte[] workbook = workbook(sheet -> {
            header(sheet);
            Row row = sheet.createRow(1);
            String[] text = {"BLRSS0803", "CH-803", "Eagle 2", "Yuma", "Yuma", "Koramangala", "KA01AA0803"};
            for (int c = 0; c < text.length; c++) {
                row.createCell(c).setCellValue(text[c]);
            }
            CellStyle dateStyle = sheet.getWorkbook().createCellStyle();
            dateStyle.setDataFormat(sheet.getWorkbook().createDataFormat().getFormat("yyyy-mm-dd"));
            var dateCell = row.createCell(7);
            dateCell.setCellValue(java.sql.Date.valueOf(LocalDate.of(2026, 9, 1)));
            dateCell.setCellStyle(dateStyle);
        });

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(xlsx("fleet.xlsx", workbook))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1))
                .andExpect(jsonPath("$.rows[0].error").doesNotExist());
    }

    /** Rows a user cleared but Excel still counts in the used range. */
    @Test
    void trailingBlankRowsAreNotCountedAsRows() throws Exception {
        byte[] workbook = workbook(sheet -> {
            header(sheet);
            textRow(sheet, 1, "BLRSS0804", "CH-804", "Eagle 2", "Yuma",
                    "Yuma", "Koramangala", "KA01AA0804", "2026-09-01");
            sheet.createRow(2);
            sheet.createRow(3).createCell(0).setCellValue("");
        });

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(xlsx("fleet.xlsx", workbook))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(1));
    }

    /** The same rule a CSV gets, reported the same way. */
    @Test
    void anExcelRowMissingARequiredFieldIsAnErrorRow() throws Exception {
        byte[] workbook = workbook(sheet -> {
            header(sheet);
            textRow(sheet, 1, "BLRSS0805", "CH-805", "", "Yuma",
                    "Yuma", "Koramangala", "KA01AA0805", "2026-09-01");
        });

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(xlsx("fleet.xlsx", workbook))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorRows").value(1))
                .andExpect(jsonPath("$.rows[0].error").isNotEmpty());
    }

    @Test
    void anExcelFileMissingAColumnIsRejectedWholesale() throws Exception {
        byte[] workbook = workbook(sheet -> {
            Row row = sheet.createRow(0);
            for (int c = 0; c < HEADERS.size() - 1; c++) {
                row.createCell(c).setCellValue(HEADERS.get(c));
            }
            textRow(sheet, 1, "BLRSS0806", "CH-806", "Eagle 2", "Yuma",
                    "Yuma", "Koramangala", "KA01AA0806");
        });

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(xlsx("fleet.xlsx", workbook))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("The file is missing the inductedOn column"));
    }

    /** A .xlsx that is not a workbook must say so, not leak a parser error. */
    @Test
    void aFileThatIsNotAWorkbookIsRejectedWithAReadableMessage() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(xlsx("fleet.xlsx", "this is not a workbook".getBytes()))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // --- plumbing -----------------------------------------------------------

    private static void header(Sheet sheet) {
        Row row = sheet.createRow(0);
        for (int c = 0; c < HEADERS.size(); c++) {
            row.createCell(c).setCellValue(HEADERS.get(c));
        }
    }

    private static void textRow(Sheet sheet, int index, String... values) {
        Row row = sheet.createRow(index);
        for (int c = 0; c < values.length; c++) {
            row.createCell(c).setCellValue(values[c]);
        }
    }

    private static byte[] workbook(java.util.function.Consumer<Sheet> build) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            build.accept(wb.createSheet("Vehicles"));
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static MockMultipartFile xlsx(String name, byte[] content) {
        return new MockMultipartFile("file", name,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content);
    }
}
