package com.evrental.vehicle;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.EncryptedDocumentException;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.ss.usermodel.BuiltinFormats;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.util.XMLHelper;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

/**
 * Bytes in, rows of text out — in memory bounded by the constants below,
 * never by the file.
 *
 * <p>The content decides, never the file name. A browser sends whatever
 * MIME type the operating system has mapped, and people rename a file to
 * "fix" a failed upload. An .xlsx always begins with the ZIP signature, an
 * .xls (and a password-protected .xlsx) with the OLE2 one, and anything
 * else is tried as text. Everything downstream — header matching, row
 * rules, the preview — sees the same {@link ImportFile} whichever it was.
 *
 * <p><b>Why streaming.</b> The first version read a workbook into POI's
 * object model and then counted its rows. A 4.5 MB workbook of 100 rows and
 * 16,384 columns — under the upload limit — became 1.6 million cell objects
 * and killed a 384 MB JVM in 1.5 seconds, which on the hosting platform is a
 * 502 and a restart that only one person can see. So the .xlsx path is a
 * SAX parse that stops at the row limit, keeps at most {@link #MAX_COLUMNS}
 * cells of a row, cuts a cell at {@link #MAX_CELL_CHARS}, and gives up on a
 * file whose text passes {@link #MAX_TOTAL_CHARS} — a budget a real fleet
 * export of 2,000 bikes uses about a twentieth of. The binary .xls has no
 * streaming reader worth the code, so it is bounded by size instead.
 */
final class ImportFileReader {

    private static final Logger log = LoggerFactory.getLogger(ImportFileReader.class);

    /** Cells past this in a row are not read. Excel allows 16,384; a fleet export has 8. */
    static final int MAX_COLUMNS = 256;
    /** A cell is cut here. The longest field accepts 80; the row then fails the length rule honestly. */
    static final int MAX_CELL_CHARS = 1_000;
    /**
     * All cell text of one file. 2,000 rows × 8 columns × ~15 characters is
     * 240,000; 2,000 rows with two 32 KB columns, each cut to 1,000, is
     * 4,000,000 and is a real file. 32 MB of UTF-16 at the limit, twice over
     * for the two parse slots, is a bound a 384 MB heap carries.
     */
    static final int MAX_TOTAL_CHARS = 16_000_000;
    /** The shared-strings table of an .xlsx, which must be read whole before any sheet. */
    static final int MAX_SHARED_STRING_CHARS = 8_000_000;
    /** The binary .xls can only be read whole. 2,000 rows of a fleet is ~200 KB. */
    static final int MAX_XLS_BYTES = 512 * 1024;
    /** Rows read when a caller does not say. The service passes its own cap plus the header scan. */
    static final int DEFAULT_MAX_ROWS = 2_011;

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
    static final String TOO_MUCH_DATA =
            "This file has too much data to check at once. Keep it under 2,000 rows and remove unused columns.";
    static final String XLS_TOO_LARGE =
            "This .xls file is larger than 512 KB. Save it as .xlsx and upload it again.";
    static final String BAD_CSV =
            "Could not read that file as a CSV. Check for a quote that is never closed, then try again.";

    static {
        // POI refuses a ZIP entry that inflates to more than 100× its size as
        // a "zip bomb". A sheet with one long value repeated down a column
        // compresses to a thousandth and is a perfectly ordinary file, so the
        // ratio test is off. What bounds a hostile file instead: memory, by
        // the budgets above, which hold whatever the ratio; and time, by the
        // entry size below — the parser stops at the row limit long before
        // a real sheet reaches it, and a sheet that is nothing but padding
        // is cut off there rather than inflated for minutes.
        ZipSecureFile.setMinInflateRatio(0.0);
        ZipSecureFile.setMaxEntrySize(256L * 1024 * 1024);
    }

    private ImportFileReader() {
    }

    static ImportFile read(byte[] bytes) {
        return read(bytes, DEFAULT_MAX_ROWS);
    }

    /**
     * @param maxRows the most rows to return; one more means the file is
     *                marked truncated and the rest is never read
     */
    static ImportFile read(byte[] bytes, int maxRows) {
        if (bytes.length == 0) {
            throw new ImportFileException(EMPTY);
        }
        if (startsWith(bytes, ZIP)) {
            return xlsx(bytes, maxRows);
        }
        if (startsWith(bytes, OLE2)) {
            return xls(bytes, maxRows);
        }
        for (byte[] signature : NOT_A_SPREADSHEET) {
            if (startsWith(bytes, signature)) {
                throw new ImportFileException(NOT_SPREADSHEET);
            }
        }
        return csv(bytes, maxRows);
    }

    // --- .xlsx, streamed ----------------------------------------------------

    /**
     * The first visible sheet with anything on it, read as a stream.
     *
     * <p>A fleet export is one sheet, but a hand-made workbook often has a
     * cover or a hidden lookup list first. Only one sheet is read: silently
     * importing a second would create bikes nobody asked for, so the name of
     * the one chosen travels with the rows for the preview to show.
     */
    private static ImportFile xlsx(byte[] bytes, int maxRows) {
        // From a file, not the byte array. OPCPackage.open(InputStream) reads
        // every ZIP entry into memory as it opens — a 131 MB sheet becomes a
        // 131 MB byte[] before a single row is parsed, which is the DOM
        // problem again by another route. Opened from a file, POI inflates
        // each entry from disk as the SAX parser pulls on it.
        Path spool;
        try {
            spool = Files.createTempFile("fleet-import-", ".xlsx");
            Files.write(spool, bytes);
        } catch (IOException e) {
            throw new ImportFileException(NOT_WORKBOOK);
        }
        try {
            return xlsx(spool.toFile(), maxRows);
        } finally {
            try {
                Files.deleteIfExists(spool);
            } catch (IOException ignored) {
                // A stray temp file is the OS's problem, not the operator's.
            }
        }
    }

    private static ImportFile xlsx(File spool, int maxRows) {
        try (OPCPackage pkg = OPCPackage.open(spool, PackageAccess.READ)) {
            XSSFReader reader = new XSSFReader(pkg);
            WorkbookInfo workbook = WorkbookInfo.parse(reader.getWorkbookData());
            Styles styles = Styles.parse(stylesOrNull(reader));
            SharedStrings strings = SharedStrings.parse(sharedStringsOrNull(reader));
            Budget budget = new Budget();

            XSSFReader.SheetIterator sheets = (XSSFReader.SheetIterator) reader.getSheetsData();
            while (sheets.hasNext()) {
                try (InputStream sheet = sheets.next()) {
                    String name = sheets.getSheetName();
                    if (workbook.hidden.contains(name)) {
                        continue;
                    }
                    SheetHandler handler = new SheetHandler(strings, styles, workbook.date1904, maxRows, budget);
                    parse(sheet, handler);
                    if (!handler.rows.isEmpty()) {
                        return new ImportFile(handler.rows, name, "xlsx", handler.truncated);
                    }
                }
            }
            throw new ImportFileException(EMPTY);
        } catch (ImportFileException e) {
            throw e;
        } catch (EncryptedDocumentException e) {
            throw new ImportFileException(PASSWORD);
        } catch (Exception e) {
            // POI throws a family of exceptions for a ZIP that is not a
            // workbook, a part that is not XML, an entry that inflates past
            // its limit. The operator gets one sentence they can act on; the
            // log keeps the reason so the next such file can be diagnosed
            // without a debugger.
            log.warn("Workbook rejected: {}: {}", e.getClass().getSimpleName(), e.getMessage());
            throw new ImportFileException(NOT_WORKBOOK);
        }
    }

    private static InputStream stylesOrNull(XSSFReader reader) {
        try {
            return reader.getStylesData();
        } catch (Exception e) {
            return null;
        }
    }

    private static InputStream sharedStringsOrNull(XSSFReader reader) {
        try {
            return reader.getSharedStringsData();
        } catch (Exception e) {
            return null;
        }
    }

    /** One SAX pass over a part, stopping cleanly when a handler has read enough. */
    private static void parse(InputStream in, DefaultHandler handler) throws IOException, SAXException {
        if (in == null) {
            return;
        }
        try {
            XMLReader parser = XMLHelper.newXMLReader();
            parser.setContentHandler(handler);
            parser.parse(new InputSource(in));
        } catch (StopReading done) {
            // The handler has its rows.
        } catch (javax.xml.parsers.ParserConfigurationException e) {
            throw new SAXException(e);
        }
    }

    /** Thrown by a handler to end the parse early. Control flow, not failure. */
    private static final class StopReading extends RuntimeException {
        StopReading() {
            super(null, null, false, false);
        }
    }

    /** The text held so far for one file. Shared by the sheet and the strings table. */
    private static final class Budget {
        private long chars;

        void spend(int n) {
            chars += n;
            if (chars > MAX_TOTAL_CHARS) {
                throw new ImportFileException(TOO_MUCH_DATA);
            }
        }
    }

    /** workbook.xml: which sheets are hidden, and whether dates count from 1904. */
    private static final class WorkbookInfo extends DefaultHandler {
        final List<String> hidden = new ArrayList<>();
        boolean date1904;

        static WorkbookInfo parse(InputStream in) throws IOException, SAXException {
            WorkbookInfo info = new WorkbookInfo();
            ImportFileReader.parse(in, info);
            return info;
        }

        @Override
        public void startElement(String uri, String local, String qName, Attributes a) {
            String name = local.isEmpty() ? qName : local;
            if (name.equals("sheet")) {
                String state = a.getValue("state");
                if ("hidden".equals(state) || "veryHidden".equals(state)) {
                    hidden.add(a.getValue("name"));
                }
            } else if (name.equals("workbookPr")) {
                String v = a.getValue("date1904");
                date1904 = "1".equals(v) || "true".equals(v);
            }
        }
    }

    /**
     * styles.xml: enough to tell a date cell from a number. Each cell carries
     * a style index; each style names a number format; a number format is
     * either built in or declared in the file.
     */
    private static final class Styles extends DefaultHandler {
        private final List<Integer> cellFormats = new ArrayList<>();
        private final Map<Integer, String> formatCodes = new HashMap<>();
        private boolean inCellXfs;

        static Styles parse(InputStream in) throws IOException, SAXException {
            Styles styles = new Styles();
            ImportFileReader.parse(in, styles);
            return styles;
        }

        boolean isDate(int styleIndex) {
            if (styleIndex < 0 || styleIndex >= cellFormats.size()) {
                return false;
            }
            int formatId = cellFormats.get(styleIndex);
            String code = formatCodes.getOrDefault(formatId, BuiltinFormats.getBuiltinFormat(formatId));
            return DateUtil.isADateFormat(formatId, code);
        }

        @Override
        public void startElement(String uri, String local, String qName, Attributes a) {
            String name = local.isEmpty() ? qName : local;
            switch (name) {
                case "numFmt" -> formatCodes.put(parseInt(a.getValue("numFmtId"), -1), a.getValue("formatCode"));
                case "cellXfs" -> inCellXfs = true;
                case "xf" -> {
                    if (inCellXfs && cellFormats.size() < 100_000) {
                        cellFormats.add(parseInt(a.getValue("numFmtId"), 0));
                    }
                }
                default -> { }
            }
        }

        @Override
        public void endElement(String uri, String local, String qName) {
            String name = local.isEmpty() ? qName : local;
            if (name.equals("cellXfs")) {
                inCellXfs = false;
            }
        }
    }

    /**
     * sharedStrings.xml: every distinct text in the workbook, by index. Read
     * whole, because sheets refer into it — so it has its own budget.
     */
    private static final class SharedStrings extends DefaultHandler {
        private final List<String> strings = new ArrayList<>();
        private final StringBuilder current = new StringBuilder();
        private boolean inItem;
        private boolean inPhonetic;
        private boolean inText;
        private long chars;

        static SharedStrings parse(InputStream in) throws IOException, SAXException {
            SharedStrings sst = new SharedStrings();
            ImportFileReader.parse(in, sst);
            return sst;
        }

        String get(int index) {
            return index >= 0 && index < strings.size() ? strings.get(index) : "";
        }

        @Override
        public void startElement(String uri, String local, String qName, Attributes a) {
            String name = local.isEmpty() ? qName : local;
            switch (name) {
                case "si" -> { inItem = true; current.setLength(0); }
                case "rPh" -> inPhonetic = true;
                case "t" -> inText = inItem && !inPhonetic;
                default -> { }
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            if (inText && current.length() <= MAX_CELL_CHARS) {
                current.append(ch, start, Math.min(length, MAX_CELL_CHARS + 1 - current.length()));
            }
        }

        @Override
        public void endElement(String uri, String local, String qName) {
            String name = local.isEmpty() ? qName : local;
            switch (name) {
                case "t" -> inText = false;
                case "rPh" -> inPhonetic = false;
                case "si" -> {
                    String value = cut(current.toString());
                    chars += value.length();
                    if (chars > MAX_SHARED_STRING_CHARS) {
                        throw new ImportFileException(TOO_MUCH_DATA);
                    }
                    strings.add(value);
                    inItem = false;
                }
                default -> { }
            }
        }
    }

    /**
     * sheetN.xml: the rows. Stops after {@code maxRows} non-blank rows, keeps
     * the first {@link #MAX_COLUMNS} cells, and renders each cell as the text
     * a person would have typed — a date serial as an ISO date, a whole
     * number without the exponent Excel's general format adds.
     */
    private static final class SheetHandler extends DefaultHandler {
        final List<List<String>> rows = new ArrayList<>();
        boolean truncated;

        private final SharedStrings strings;
        private final Styles styles;
        private final boolean date1904;
        private final int maxRows;
        private final Budget budget;

        private List<String> row;
        private int cursor;
        private int column;
        private String type;
        private int style;
        private final StringBuilder value = new StringBuilder();
        private final StringBuilder inlineText = new StringBuilder();
        private boolean inValue;
        private boolean inInlineString;
        private boolean inInlineText;

        SheetHandler(SharedStrings strings, Styles styles, boolean date1904, int maxRows, Budget budget) {
            this.strings = strings;
            this.styles = styles;
            this.date1904 = date1904;
            this.maxRows = maxRows;
            this.budget = budget;
        }

        @Override
        public void startElement(String uri, String local, String qName, Attributes a) {
            String name = local.isEmpty() ? qName : local;
            switch (name) {
                case "row" -> { row = new ArrayList<>(); cursor = 0; }
                case "c" -> {
                    column = columnOf(a.getValue("r"), cursor);
                    type = a.getValue("t");
                    style = parseInt(a.getValue("s"), -1);
                    value.setLength(0);
                    inlineText.setLength(0);
                }
                case "v" -> inValue = true;
                case "is" -> inInlineString = true;
                case "t" -> inInlineText = inInlineString;
                default -> { }
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            StringBuilder target = inValue ? value : inInlineText ? inlineText : null;
            if (target != null && target.length() <= MAX_CELL_CHARS) {
                target.append(ch, start, Math.min(length, MAX_CELL_CHARS + 1 - target.length()));
            }
        }

        @Override
        public void endElement(String uri, String local, String qName) {
            String name = local.isEmpty() ? qName : local;
            switch (name) {
                case "v" -> inValue = false;
                case "t" -> inInlineText = false;
                case "is" -> inInlineString = false;
                case "c" -> {
                    if (row != null) {
                        place(column, text());
                        cursor = column + 1;
                    }
                }
                case "row" -> {
                    if (row != null && !row.stream().allMatch(String::isEmpty)) {
                        if (rows.size() >= maxRows) {
                            truncated = true;
                            throw new StopReading();
                        }
                        rows.add(row);
                    }
                    row = null;
                }
                default -> { }
            }
        }

        private void place(int col, String text) {
            if (col >= MAX_COLUMNS || col < 0) {
                return;
            }
            budget.spend(text.length());
            while (row.size() < col) {
                row.add("");
            }
            if (row.size() == col) {
                row.add(text);
            } else {
                row.set(col, text);
            }
        }

        private String text() {
            String raw = value.toString();
            String out;
            if (type == null || type.equals("n")) {
                out = number(raw);
            } else {
                out = switch (type) {
                    case "s" -> strings.get(parseInt(raw.trim(), -1));
                    case "inlineStr" -> inlineText.toString();
                    case "b" -> raw.trim().equals("1") ? "TRUE" : "FALSE";
                    case "e" -> "";
                    default -> raw; // "str" (a formula's cached string), "d" (an ISO date)
                };
            }
            return cut(out.trim());
        }

        private String number(String raw) {
            if (raw.isBlank()) {
                return "";
            }
            double d;
            try {
                d = Double.parseDouble(raw.trim());
            } catch (NumberFormatException e) {
                return raw;
            }
            if (styles.isDate(style) && DateUtil.isValidExcelDate(d)) {
                LocalDate date = DateUtil.getLocalDateTime(d, date1904).toLocalDate();
                return date.format(DateTimeFormatter.ISO_LOCAL_DATE);
            }
            if (d == Math.rint(d) && !Double.isInfinite(d) && Math.abs(d) < 1e15) {
                return String.valueOf((long) d);
            }
            return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
        }

        /** "AB12" → 27; a cell with no reference takes the next column along. */
        private static int columnOf(String ref, int fallback) {
            if (ref == null || ref.isEmpty()) {
                return fallback;
            }
            int i = 0;
            while (i < ref.length() && Character.isLetter(ref.charAt(i))) {
                i++;
            }
            return i == 0 ? fallback : CellReference.convertColStringToIndex(ref.substring(0, i));
        }
    }

    // --- .xls, read whole but bounded by size ------------------------------

    /**
     * The binary format Excel wrote before 2007. POI only reads it into an
     * object model, so the file size is the memory bound: 512 KB is two to
     * three times a 2,000-row fleet, and anything bigger is better saved as
     * .xlsx by the person who has it than parsed here.
     */
    private static ImportFile xls(byte[] bytes, int maxRows) {
        try (POIFSFileSystem fs = new POIFSFileSystem(new ByteArrayInputStream(bytes))) {
            if (fs.getRoot().hasEntry("EncryptedPackage") || fs.getRoot().hasEntry("EncryptionInfo")) {
                // An encrypted .xlsx is an OLE2 container around the real
                // file. Checked before the size rule so the advice is about
                // the password, not the size.
                throw new ImportFileException(PASSWORD);
            }
            if (bytes.length > MAX_XLS_BYTES) {
                throw new ImportFileException(XLS_TOO_LARGE);
            }
            try (HSSFWorkbook wb = new HSSFWorkbook(fs)) {
                DataFormatter formatter = new DataFormatter();
                FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();
                Budget budget = new Budget();
                for (int i = 0; i < wb.getNumberOfSheets(); i++) {
                    if (wb.isSheetHidden(i) || wb.isSheetVeryHidden(i)) {
                        continue;
                    }
                    Sheet sheet = wb.getSheetAt(i);
                    List<List<String>> rows = new ArrayList<>();
                    boolean truncated = false;
                    for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
                        Row row = sheet.getRow(r);
                        if (row == null) {
                            continue;
                        }
                        List<String> values = new ArrayList<>();
                        for (int c = 0; c < Math.min(row.getLastCellNum(), MAX_COLUMNS); c++) {
                            String text = cut(cell(row.getCell(c), formatter, evaluator));
                            budget.spend(text.length());
                            values.add(text);
                        }
                        if (values.stream().allMatch(String::isEmpty)) {
                            continue;
                        }
                        if (rows.size() >= maxRows) {
                            truncated = true;
                            break;
                        }
                        rows.add(values);
                    }
                    if (!rows.isEmpty()) {
                        return new ImportFile(rows, sheet.getSheetName(), "xls", truncated);
                    }
                }
                throw new ImportFileException(EMPTY);
            }
        } catch (ImportFileException e) {
            throw e;
        } catch (EncryptedDocumentException e) {
            throw new ImportFileException(PASSWORD);
        } catch (IOException | RuntimeException e) {
            log.warn("Workbook rejected: {}: {}", e.getClass().getSimpleName(), e.getMessage());
            throw new ImportFileException(NOT_WORKBOOK);
        }
    }

    /** One .xls cell as the text a person would have typed; see {@link SheetHandler#text()}. */
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

    private static ImportFile csv(byte[] bytes, int maxRows) {
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
        boolean truncated = false;
        Budget budget = new Budget();
        try (CSVParser parser = CSVParser.parse(new StringReader(text), format)) {
            for (CSVRecord record : parser) {
                List<String> values = new ArrayList<>(Math.min(record.size(), MAX_COLUMNS));
                for (int c = 0; c < Math.min(record.size(), MAX_COLUMNS); c++) {
                    String v = record.get(c);
                    String cell = cut(v == null ? "" : v.trim());
                    budget.spend(cell.length());
                    values.add(cell);
                }
                if (values.stream().allMatch(String::isEmpty)) {
                    continue;
                }
                if (rows.size() >= maxRows) {
                    truncated = true;
                    break;
                }
                rows.add(values);
            }
        } catch (ImportFileException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            // Commons CSV's one real complaint about text is a quote that
            // never closes (the rest of the file becomes one cell and then
            // runs out). It is text, so "not a spreadsheet" would be wrong.
            log.warn("CSV rejected: {}: {}", e.getClass().getSimpleName(), e.getMessage());
            throw new ImportFileException(BAD_CSV);
        }
        if (rows.isEmpty()) {
            throw new ImportFileException(EMPTY);
        }
        return new ImportFile(rows, null, "csv", truncated);
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
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
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

    // --- shared ------------------------------------------------------------

    private static String cut(String text) {
        return text.length() > MAX_CELL_CHARS ? text.substring(0, MAX_CELL_CHARS) : text;
    }

    private static int parseInt(String value, int fallback) {
        if (value == null || value.isEmpty()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        return bytes.length >= prefix.length
                && Arrays.equals(bytes, 0, prefix.length, prefix, 0, prefix.length);
    }
}
