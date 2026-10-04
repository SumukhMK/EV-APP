package com.evrental.vehicle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Consumer;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.poifs.crypt.EncryptionInfo;
import org.apache.poi.poifs.crypt.EncryptionMode;
import org.apache.poi.poifs.crypt.Encryptor;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

/**
 * Bytes in, rows of text out — whatever the bytes are.
 *
 * <p>The reader decides by content, never by file name: a browser sends
 * whatever MIME type the OS has mapped, and people rename files to "fix"
 * an upload. Every format below has arrived from a real hub at some point:
 * the old binary .xls, a CSV with Excel's byte-order mark, a semicolon CSV
 * from a European locale, the tab-separated UTF-16 "Unicode Text" export, a
 * Windows-1252 file with an accent in a hub name. Each was a rejection with
 * a misleading message about a missing column.
 */
class ImportFileReaderTest {

    // --- Excel -------------------------------------------------------------

    @Test
    void anXlsxIsReadAsRowsOfText() {
        byte[] bytes = xlsx(sheet -> {
            text(sheet, 0, "id", "model");
            text(sheet, 1, "BLRSS0001", "Eagle 2");
        });

        ImportFile file = ImportFileReader.read(bytes);

        assertThat(file.rows()).containsExactly(List.of("id", "model"), List.of("BLRSS0001", "Eagle 2"));
        assertThat(file.sheetName()).isEqualTo("Vehicles");
        assertThat(file.format()).isEqualTo("xlsx");
    }

    /** The binary format Excel wrote before 2007. Still what some exports produce. */
    @Test
    void anOldBinaryXlsIsReadToo() {
        byte[] bytes = workbook(new HSSFWorkbook(), sheet -> {
            text(sheet, 0, "id", "model");
            text(sheet, 1, "BLRSS0001", "Eagle 2");
        });

        ImportFile file = ImportFileReader.read(bytes);

        assertThat(file.rows()).hasSize(2);
        assertThat(file.format()).isEqualTo("xls");
    }

    @Test
    void aDateCellIsReadAsAnIsoDateAndANumericIdWithoutAnExponent() {
        byte[] bytes = xlsx(sheet -> {
            text(sheet, 0, "id", "inductedOn");
            Row row = sheet.createRow(1);
            row.createCell(0).setCellValue(123456789012d);
            CellStyle dateStyle = sheet.getWorkbook().createCellStyle();
            dateStyle.setDataFormat(sheet.getWorkbook().createDataFormat().getFormat("dd/mm/yyyy"));
            Cell date = row.createCell(1);
            date.setCellValue(java.sql.Date.valueOf(LocalDate.of(2026, 9, 1)));
            date.setCellStyle(dateStyle);
        });

        assertThat(ImportFileReader.read(bytes).rows().get(1)).containsExactly("123456789012", "2026-09-01");
    }

    @Test
    void blankAndClearedRowsAreDropped() {
        byte[] bytes = xlsx(sheet -> {
            text(sheet, 0, "id", "model");
            sheet.createRow(1);
            text(sheet, 2, "", "");
            text(sheet, 3, "BLRSS0001", "Eagle 2");
        });

        assertThat(ImportFileReader.read(bytes).rows()).hasSize(2);
    }

    /** A cover sheet first, then the data. The reader finds the data. */
    @Test
    void theFirstSheetWithAnyContentIsTheOneRead() {
        byte[] bytes = multiSheet(new XSSFWorkbook(), wb -> {
            wb.createSheet("Cover");
            Sheet data = wb.createSheet("Fleet");
            text(data, 0, "id", "model");
            text(data, 1, "BLRSS0001", "Eagle 2");
        });

        ImportFile file = ImportFileReader.read(bytes);

        assertThat(file.sheetName()).isEqualTo("Fleet");
        assertThat(file.rows()).hasSize(2);
    }

    @Test
    void hiddenSheetsAreSkipped() {
        byte[] bytes = multiSheet(new XSSFWorkbook(), wb -> {
            Sheet lookup = wb.createSheet("Lookups");
            text(lookup, 0, "Yuma", "Lithium");
            wb.setSheetHidden(0, true);
            Sheet data = wb.createSheet("Fleet");
            text(data, 0, "id", "model");
        });

        assertThat(ImportFileReader.read(bytes).sheetName()).isEqualTo("Fleet");
    }

    @Test
    void aWorkbookWithNothingInItIsEmpty() {
        byte[] bytes = multiSheet(new XSSFWorkbook(), wb -> wb.createSheet("Empty"));

        assertThatThrownBy(() -> ImportFileReader.read(bytes))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("The file is empty");
    }

    @Test
    void aPasswordProtectedWorkbookSaysSo() throws Exception {
        byte[] plain = xlsx(sheet -> text(sheet, 0, "id", "model"));
        byte[] locked;
        try (POIFSFileSystem fs = new POIFSFileSystem(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            EncryptionInfo info = new EncryptionInfo(EncryptionMode.agile);
            Encryptor encryptor = info.getEncryptor();
            encryptor.confirmPassword("secret");
            try (var os = encryptor.getDataStream(fs)) {
                os.write(plain);
            }
            fs.writeFilesystem(out);
            locked = out.toByteArray();
        }

        assertThatThrownBy(() -> ImportFileReader.read(locked))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("This workbook is password-protected. Remove the password and upload it again.");
    }

    // --- Bounds: what keeps a bad file from taking the server down ----------

    /**
     * The reader stops at the row limit instead of loading the whole sheet.
     * A 16,384-column, 100-row workbook of 4.5 MB killed a 384 MB JVM in
     * 1.5 seconds when the sheet was read into a DOM first; every test in
     * this section is a budget that makes memory depend on our constants,
     * not on the file.
     */
    @Test
    void readingStopsAtTheRowLimitInsteadOfLoadingTheWholeSheet() {
        byte[] bytes = streamedXlsx(5_000, 2, 10);

        ImportFile file = ImportFileReader.read(bytes, 100);

        assertThat(file.rows()).hasSize(100);
        assertThat(file.truncated()).isTrue();
    }

    @Test
    void aFileWithinTheRowLimitIsNotMarkedTruncated() {
        byte[] bytes = streamedXlsx(50, 2, 10);

        ImportFile file = ImportFileReader.read(bytes, 100);

        // Header plus fifty.
        assertThat(file.rows()).hasSize(51);
        assertThat(file.truncated()).isFalse();
    }

    @Test
    void onlyTheFirstColumnsAreRead() {
        byte[] bytes = streamedXlsx(3, 2_000, 1);

        ImportFile file = ImportFileReader.read(bytes);

        assertThat(file.rows()).allSatisfy(row -> assertThat(row).hasSizeLessThanOrEqualTo(ImportFileReader.MAX_COLUMNS));
    }

    @Test
    void aCellLongerThanTheLimitIsCutOff() {
        byte[] bytes = xlsx(sheet -> text(sheet, 0, "id", "x".repeat(5_000)));

        assertThat(ImportFileReader.read(bytes).rows().get(0).get(1)).hasSize(ImportFileReader.MAX_CELL_CHARS);
    }

    /** One 32 KB string repeated down a column compresses to under 1%, which POI's default guard calls a zip bomb. */
    @Test
    void aHighlyRepetitiveSheetIsNotMistakenForAZipBomb() {
        String blob = "lorem ipsum ".repeat(2_730);
        byte[] bytes = streamedXlsx(2_000, 2, 1, blob);

        ImportFile file = ImportFileReader.read(bytes, 2_011);

        // Header plus two thousand.
        assertThat(file.rows()).hasSize(2_001);
    }

    /** Within the row and column limits but with far more text than a fleet export carries. */
    @Test
    void aSheetWithTooMuchTextIsRefusedRatherThanHeld() {
        byte[] bytes = streamedXlsx(2_000, 200, 60);

        assertThatThrownBy(() -> ImportFileReader.read(bytes, 2_011))
                .isInstanceOf(ImportFileException.class)
                .hasMessage(ImportFileReader.TOO_MUCH_DATA);
    }

    /** The binary .xls can only be read whole, so its size is the bound. */
    @Test
    void anOversizedXlsIsRefusedWithAdvice() throws Exception {
        byte[] bytes;
        try (HSSFWorkbook wb = new HSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Vehicles");
            for (int r = 0; r < 4_000; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < 20; c++) {
                    row.createCell(c).setCellValue("cell " + r + "," + c);
                }
            }
            wb.write(out);
            bytes = out.toByteArray();
        }
        assertThat(bytes.length).isGreaterThan(ImportFileReader.MAX_XLS_BYTES);

        assertThatThrownBy(() -> ImportFileReader.read(bytes))
                .isInstanceOf(ImportFileException.class)
                .hasMessage(ImportFileReader.XLS_TOO_LARGE);
    }

    // --- CSV ---------------------------------------------------------------

    @Test
    void excelsByteOrderMarkDoesNotStickToTheFirstHeader() {
        byte[] bytes = csv("﻿id,model\nBLRSS0001,Eagle 2\n", StandardCharsets.UTF_8);

        ImportFile file = ImportFileReader.read(bytes);

        assertThat(file.rows().get(0)).containsExactly("id", "model");
        assertThat(file.format()).isEqualTo("csv");
        assertThat(file.sheetName()).isNull();
    }

    @Test
    void aSemicolonSeparatedFileIsSplitOnSemicolons() {
        byte[] bytes = csv("id;model;hub\nBLRSS0001;Eagle 2;Koramangala\n", StandardCharsets.UTF_8);

        assertThat(ImportFileReader.read(bytes).rows().get(1))
                .containsExactly("BLRSS0001", "Eagle 2", "Koramangala");
    }

    /** Excel's "Unicode Text" export: UTF-16LE with a BOM, tab separated. */
    @Test
    void aTabSeparatedUtf16FileIsRead() {
        byte[] bytes = csv("﻿id\tmodel\nBLRSS0001\tEagle 2\n", StandardCharsets.UTF_16LE);

        ImportFile file = ImportFileReader.read(bytes);

        assertThat(file.rows()).containsExactly(List.of("id", "model"), List.of("BLRSS0001", "Eagle 2"));
    }

    @Test
    void aWindows1252FileKeepsItsAccents() {
        byte[] bytes = csv("id,hub\nBLRSS0001,Café Hub\n", Charset.forName("windows-1252"));

        assertThat(ImportFileReader.read(bytes).rows().get(1)).containsExactly("BLRSS0001", "Café Hub");
    }

    @Test
    void quotedFieldsMayContainTheDelimiterAndNewlines() {
        byte[] bytes = csv("id,model\nBLRSS0001,\"Eagle 2, Pro\nEdition\"\n", StandardCharsets.UTF_8);

        assertThat(ImportFileReader.read(bytes).rows().get(1)).containsExactly("BLRSS0001", "Eagle 2, Pro\nEdition");
    }

    @Test
    void blankLinesInACsvAreDropped() {
        byte[] bytes = csv("id,model\n\n  \nBLRSS0001,Eagle 2\n,\n", StandardCharsets.UTF_8);

        assertThat(ImportFileReader.read(bytes).rows()).hasSize(2);
    }

    /** A quote opened and never closed swallows the rest of the file. Name the cause, not "not a spreadsheet". */
    @Test
    void anUnclosedQuoteIsNamedAsSuch() {
        byte[] bytes = csv("id,model\nBLRSS0001,\"Eagle 2\nBLRSS0002,Eagle 2\n", StandardCharsets.UTF_8);

        assertThatThrownBy(() -> ImportFileReader.read(bytes))
                .isInstanceOf(ImportFileException.class)
                .hasMessage(ImportFileReader.BAD_CSV);
    }

    @Test
    void csvReadingStopsAtTheRowLimit() {
        StringBuilder sb = new StringBuilder("id,model\n");
        for (int i = 0; i < 5_000; i++) {
            sb.append("ID").append(i).append(",Eagle 2\n");
        }

        ImportFile file = ImportFileReader.read(csv(sb.toString(), StandardCharsets.UTF_8), 100);

        assertThat(file.rows()).hasSize(100);
        assertThat(file.truncated()).isTrue();
    }

    @Test
    void csvColumnsAndCellsAreCappedToo() {
        String header = String.join(",", java.util.Collections.nCopies(2_000, "c"));
        String row = "ID1," + "y".repeat(5_000);

        ImportFile file = ImportFileReader.read(csv(header + "\n" + row + "\n", StandardCharsets.UTF_8));

        assertThat(file.rows().get(0)).hasSize(ImportFileReader.MAX_COLUMNS);
        assertThat(file.rows().get(1).get(1)).hasSize(ImportFileReader.MAX_CELL_CHARS);
    }

    // --- Not a spreadsheet --------------------------------------------------

    @Test
    void anEmptyUploadIsEmpty() {
        assertThatThrownBy(() -> ImportFileReader.read(new byte[0]))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("The file is empty");
    }

    @Test
    void aPdfIsNotASpreadsheet() {
        byte[] bytes = "%PDF-1.7\n%âãÏÓ\n1 0 obj".getBytes(StandardCharsets.ISO_8859_1);

        assertThatThrownBy(() -> ImportFileReader.read(bytes))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("That file is not a spreadsheet. Upload an .xlsx, .xls or .csv file.");
    }

    @Test
    void anImageIsNotASpreadsheet() {
        byte[] bytes = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

        assertThatThrownBy(() -> ImportFileReader.read(bytes))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("That file is not a spreadsheet. Upload an .xlsx, .xls or .csv file.");
    }

    /** A ZIP that is not a workbook — a .docx, say, renamed to .xlsx. */
    @Test
    void aZipThatIsNotAWorkbookIsRejectedReadably() {
        byte[] bytes = {'P', 'K', 3, 4, 20, 0, 0, 0, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

        assertThatThrownBy(() -> ImportFileReader.read(bytes))
                .isInstanceOf(ImportFileException.class)
                .hasMessage("Could not read that file as an Excel workbook. Save it as .xlsx or .csv and try again.");
    }

    // --- plumbing -----------------------------------------------------------

    private static byte[] csv(String text, Charset charset) {
        return text.getBytes(charset);
    }

    private static byte[] streamedXlsx(int rows, int columns, int cellChars) {
        return streamedXlsx(rows, columns, cellChars, null);
    }

    /**
     * A workbook written with the streaming writer, so a test can produce
     * thousands of rows or columns without itself holding them. The header
     * is {@code c0, c1, …}; every data cell is {@code fixed} when given, or
     * a distinct string of {@code cellChars} characters otherwise.
     */
    private static byte[] streamedXlsx(int rows, int columns, int cellChars, String fixed) {
        try (SXSSFWorkbook wb = new SXSSFWorkbook(100); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Vehicles");
            Row header = sheet.createRow(0);
            for (int c = 0; c < columns; c++) {
                header.createCell(c).setCellValue("c" + c);
            }
            for (int r = 1; r <= rows; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < columns; c++) {
                    String value = fixed != null ? fixed : ("r" + r + "c" + c + "-").repeat(Math.max(1, cellChars / 8));
                    row.createCell(c).setCellValue(fixed != null ? value : value.substring(0, Math.min(value.length(), cellChars)));
                }
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] xlsx(Consumer<Sheet> build) {
        return workbook(new XSSFWorkbook(), build);
    }

    private static byte[] workbook(Workbook wb, Consumer<Sheet> build) {
        return multiSheet(wb, w -> build.accept(w.createSheet("Vehicles")));
    }

    private static byte[] multiSheet(Workbook wb, Consumer<Workbook> build) {
        try (wb; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            build.accept(wb);
            wb.write(out);
            return out.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void text(Sheet sheet, int index, String... values) {
        Row row = sheet.createRow(index);
        for (int c = 0; c < values.length; c++) {
            row.createCell(c).setCellValue(values[c]);
        }
    }
}
