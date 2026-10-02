package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The downloadable Excel template.
 *
 * <p>The template is generated from the same HEADERS the parser reads rather
 * than kept as a checked-in file, so the two cannot drift. The last test is
 * the one that matters: the template, filled in and sent straight back, is a
 * valid import. A template the server rejects is worse than none.
 */
class VehicleImportTemplateTest extends VehicleTestBase {

    @Test
    void theTemplateDownloadsAsAnExcelWorkbook() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/vehicles/imports/template")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn();

        byte[] body = result.getResponse().getContentAsByteArray();
        assertThat(body).isNotEmpty();
        assertThat(result.getResponse().getHeader("Content-Disposition"))
                .contains("attachment")
                .contains(".xlsx");

        // A real workbook, openable by Excel.
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(body))) {
            Sheet sheet = wb.getSheetAt(0);
            Row header = sheet.getRow(0);
            List<String> headers = new ArrayList<>();
            for (int c = 0; c < header.getLastCellNum(); c++) {
                headers.add(header.getCell(c).getStringCellValue());
            }
            assertThat(headers).containsExactly(
                    "id", "chassisNumber", "model", "batteryType",
                    "batteryVendor", "hub", "registrationNumber", "inductedOn");
        }
    }

    @Test
    void theTemplateIsSignedInOnly() throws Exception {
        mvc.perform(get("/api/v1/vehicles/imports/template"))
                .andExpect(status().isUnauthorized());
    }

    /** The round trip: download it, send it back, and it imports. */
    @Test
    void theTemplatesOwnExampleRowsAreAValidImport() throws Exception {
        byte[] template = mvc.perform(get("/api/v1/vehicles/imports/template")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(new MockMultipartFile("file", "fleet-template.xlsx",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", template))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorRows").value(0))
                .andExpect(jsonPath("$.validRows").value(2));
    }
}
