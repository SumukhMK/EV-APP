package com.evrental.vehicle;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.EncryptedDocumentException;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

/**
 * Bytes in, rows of text out.
 *
 * <p>The content decides, never the file name. A browser sends whatever
 * MIME type the operating system has mapped, and people rename a file to
 * "fix" a failed upload. An .xlsx always begins with the ZIP signature, an
 * .xls (and a password-protected .xlsx) with the OLE2 one, and anything
 * else is tried as text. Everything downstream — header matching, row
 * rules, the preview — sees the same {@link ImportFile} whichever it was.
 */
final class ImportFileReader {

    private static final byte[] ZIP = {0x50, 0x4B};
    private static final byte[] OLE2 = {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0};
    private static final List<byte[]> NOT_A_SPREADSHEET = List.of(
            "%PDF".getBytes(StandardCharsets.ISO_8859_1),
            new byte[] {(byte) 0x89, 'P', 'N', 'G'},
            new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},
            "GIF8".getBytes(StandardCharsets.ISO_8859_1),
            "RIFF".getBytes(StandardCharsets.ISO_8859_1));
    private static final byte[] BOM_UTF8 = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final byte[] BOM_UTF16LE = {(byte) 0xFF, (byte) 0xFE};
    private static final byte[] BOM_UTF16BE = {(byte) 0xFE, (byte) 0xFF};
    private static final char[] DELIMITERS = {',', ';', '\t', '|'};

    static final String EMPTY = "The file is empty";
    static final String NOT_SPREADSHEET = "That file is not a spreadsheet. Upload an .xlsx, .xls or .csv file.";
    static final String NOT_WORKBOOK =
            "Could not read that file as an Excel workbook. Save it as .xlsx or .csv and try again.";
    static final String PASSWORD = "This workbook is password-protected. Remove the password and upload it again.";

    private ImportFileReader() {
    }

    static ImportFile read(byte[] bytes) {
        if (bytes.length == 0) {
            throw new ImportFileException(EMPTY);
        }
        if (startsWith(bytes, ZIP) || startsWith(bytes, OLE2)) {
            return workbook(bytes);
        }
        for (byte[] signature : NOT_A_SPREADSHEET) {
            if (startsWith(bytes, signature)) {
                throw new ImportFileException(NOT_SPREADSHEET);
            }
        }
        return csv(bytes);
    }

    // --- Excel -------------------------------------------------------------

    /**
     * The first visible sheet with anything on it.
     *
     * <p>A fleet export is one sheet, but a hand-made workbook often has a
     * cover or a hidden lookup list first. Only one sheet is read: silently
     * importing a second would create bikes nobody asked for, so the name of
     * the one chosen travels with the rows for the preview to show.
     */
    private static ImportFile workbook(byte[] bytes) {
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            String format = wb instanceof HSSFWorkbook ? "xls" : "xlsx";
            DataFormatter formatter = new DataFormatter();
            FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();
            for (int i = 0; i < wb.getNumberOfSheets(); i++) {
                if (wb.isSheetHidden(i) || wb.isSheetVeryHidden(i)) {
                    continue;
                }
                Sheet sheet = wb.getSheetAt(i);
                List<List<String>> rows = rows(sheet, formatter, evaluator);
                if (!rows.isEmpty()) {
                    return new ImportFile(rows, sheet.getSheetName(), format);
                }
            }
            throw new ImportFileException(EMPTY);
        } catch (EncryptedDocumentException e) {
            throw new ImportFileException(PASSWORD);
        } catch (ImportFileException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            // POI throws a family of unchecked exceptions for a ZIP that is
            // not a workbook or an OLE2 file that is a Word document. The
            // operator gets one sentence they can act on, not a class name.
            throw new ImportFileException(NOT_WORKBOOK);
        }
    }

    private static List<List<String>> rows(Sheet sheet, DataFormatter formatter, FormulaEvaluator evaluator) {
        List<List<String>> rows = new ArrayList<>();
        for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) {
                // Cleared by the user; Excel keeps it in the used range.
                continue;
            }
            List<String> values = new ArrayList<>();
            for (int c = 0; c < row.getLastCellNum(); c++) {
                values.add(cell(row.getCell(c), formatter, evaluator));
            }
            if (!values.stream().allMatch(String::isEmpty)) {
                rows.add(values);
            }
        }
        return rows;
    }

    /**
     * One cell as the text a person would have typed.
     *
     * <p>A date cell holds a serial number, so a date picked from Excel's
     * picker arrives as 46266 and must go back out as 2026-09-01. A registry
     * id Excel decided was numeric would render as 1.23457E+11, so a whole
     * number is written without the exponent or the trailing .0.
     */
    private static String cell(Cell cell, DataFormatter formatter, FormulaEvaluator evaluator) {
        if (cell == null) {
            return "";
        }
        CellType type = cell.getCellType() == CellType.FORMULA
                ? cell.getCachedFormulaResultType()
                : cell.getCellType();
        if (type == CellType.NUMERIC) {
            if (DateUtil.isCellDateFormatted(cell)) {
                LocalDate date = cell.getLocalDateTimeCellValue().toLocalDate();
                return date.format(DateTimeFormatter.ISO_LOCAL_DATE);
            }
            double value = cell.getNumericCellValue();
            if (value == Math.rint(value) && !Double.isInfinite(value) && Math.abs(value) < 1e15) {
                return String.valueOf((long) value);
            }
        }
        return formatter.formatCellValue(cell, evaluator).trim();
    }

    // --- CSV ---------------------------------------------------------------

    private static ImportFile csv(byte[] bytes) {
        String text = decode(bytes);
        if (text.isBlank()) {
            throw new ImportFileException(EMPTY);
        }
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setDelimiter(delimiter(text))
                .setIgnoreEmptyLines(true)
                .setIgnoreSurroundingSpaces(true)
                .setTrim(true)
                .get();
        List<List<String>> rows = new ArrayList<>();
        try (CSVParser parser = CSVParser.parse(new StringReader(text), format)) {
            for (CSVRecord record : parser) {
                List<String> values = new ArrayList<>(record.size());
                record.forEach(v -> values.add(v == null ? "" : v.trim()));
                if (!values.stream().allMatch(String::isEmpty)) {
                    rows.add(values);
                }
            }
        } catch (IOException | RuntimeException e) {
            throw new ImportFileException(NOT_SPREADSHEET);
        }
        if (rows.isEmpty()) {
            throw new ImportFileException(EMPTY);
        }
        return new ImportFile(rows, null, "csv");
    }

    /**
     * The bytes as text, by byte-order mark first and by trial second.
     *
     * <p>Excel writes a UTF-8 BOM on "CSV UTF-8" and a UTF-16LE one on
     * "Unicode Text". Without a mark, strict UTF-8 is tried — strict, so a
     * Windows-1252 accent fails here rather than becoming U+FFFD — and the
     * file is then read as Windows-1252, which is what an older Excel on
     * Windows writes. A NUL byte in the first kilobyte means binary, not
     * text: a .doc, a .zip, something renamed.
     */
    private static String decode(byte[] bytes) {
        if (startsWith(bytes, BOM_UTF8)) {
            return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        }
        if (startsWith(bytes, BOM_UTF16LE)) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
        }
        if (startsWith(bytes, BOM_UTF16BE)) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
        }
        for (int i = 0; i < Math.min(bytes.length, 1024); i++) {
            if (bytes[i] == 0) {
                throw new ImportFileException(NOT_SPREADSHEET);
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            return new String(bytes, Charset.forName("windows-1252"));
        }
    }

    /**
     * The separator used most on the header line, outside quotes. Comma
     * unless something else clearly wins — a header with no separator at
     * all is one column, and the header matcher will say so.
     */
    private static char delimiter(String text) {
        int end = text.indexOf('\n');
        String line = end < 0 ? text : text.substring(0, end);
        char best = ',';
        int bestCount = 0;
        boolean inQuotes = false;
        int[] counts = new int[DELIMITERS.length];
        for (char ch : line.toCharArray()) {
            if (ch == '"') {
                inQuotes = !inQuotes;
            } else if (!inQuotes) {
                for (int d = 0; d < DELIMITERS.length; d++) {
                    if (ch == DELIMITERS[d]) {
                        counts[d]++;
                    }
                }
            }
        }
        for (int d = 0; d < DELIMITERS.length; d++) {
            if (counts[d] > bestCount) {
                bestCount = counts[d];
                best = DELIMITERS[d];
            }
        }
        return best;
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        return bytes.length >= prefix.length
                && Arrays.equals(bytes, 0, prefix.length, prefix, 0, prefix.length);
    }
}
