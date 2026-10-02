package com.evrental.vehicle;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * The Excel file an operator downloads, fills in and uploads.
 *
 * <p>Generated from {@link VehicleImportService#HEADERS} rather than checked
 * in as a binary, because a template is a promise about what the parser
 * accepts and a checked-in file keeps that promise only until someone adds a
 * column. {@code VehicleImportTemplateTest} closes the loop by uploading the
 * generated file and asserting it imports.
 *
 * <p>Everything is text. Excel will helpfully turn a registry id into a
 * number and a date into a serial if it is allowed to guess, and while the
 * reader handles both, a template that round-trips unchanged is easier to
 * trust.
 */
@Component
public class VehicleImportTemplate {

    static final String FILE_NAME = "fleet-template.xlsx";

    /** Two rows, so the shape of a real value is obvious without a legend. */
    private static final List<List<String>> EXAMPLES = List.of(
            List.of("BLRSS0001", "CH-0001", "Eagle 2", "Yuma", "Yuma",
                    "Koramangala", "KA01AA0001", "2026-09-01"),
            List.of("BLRSS0002", "CH-0002", "Eagle 2", "Lithium", "Exide",
                    "Indiranagar", "KA01AA0002", "2026-09-15"));

    private static final List<String> NOTES = List.of(
            "How to use this file",
            "",
            "1. Replace the two example rows with your own bikes. Keep the header row exactly as it is.",
            "2. Required for every row: id, chassisNumber, model, batteryType, hub, inductedOn.",
            "3. batteryVendor and registrationNumber may be left blank, but keep the columns.",
            "4. inductedOn is the date the bike joined the fleet, written as YYYY-MM-DD.",
            "5. id is the registry id an operator reads off the bike, such as BLRSS0001. It must be unique.",
            "6. chassisNumber must also be unique.",
            "7. Save as .xlsx or .csv and upload it on the Bulk upload screen.",
            "",
            "Every bike is created in the INDUCTED state. Move it on from the vehicle screen.",
            "Nothing is imported until you review the preview and confirm.");

    public byte[] workbook() {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Vehicles");

            CellStyle headerStyle = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            headerStyle.setFont(bold);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);

            CellStyle textStyle = wb.createCellStyle();
            textStyle.setDataFormat(wb.createDataFormat().getFormat("@"));

            Row header = sheet.createRow(0);
            List<String> headers = VehicleImportService.HEADERS;
            for (int c = 0; c < headers.size(); c++) {
                Cell cell = header.createCell(c);
                cell.setCellValue(headers.get(c));
                cell.setCellStyle(headerStyle);
            }

            for (int r = 0; r < EXAMPLES.size(); r++) {
                Row row = sheet.createRow(r + 1);
                List<String> values = EXAMPLES.get(r);
                for (int c = 0; c < values.size(); c++) {
                    Cell cell = row.createCell(c);
                    cell.setCellValue(values.get(c));
                    cell.setCellStyle(textStyle);
                }
            }

            for (int c = 0; c < headers.size(); c++) {
                sheet.autoSizeColumn(c);
            }
            sheet.createFreezePane(0, 1);

            Sheet notes = wb.createSheet("Notes");
            for (int i = 0; i < NOTES.size(); i++) {
                notes.createRow(i).createCell(0).setCellValue(NOTES.get(i));
            }
            notes.autoSizeColumn(0);

            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            // Writing to a byte array; there is no device to fail.
            throw new IllegalStateException("Could not build the import template", e);
        }
    }
}
