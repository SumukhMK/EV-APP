package com.evrental.vehicle;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class VehicleImportService {

    /** Package-private so {@link VehicleImportTemplate} builds from the same list. */
    static final List<String> HEADERS = List.of(
            "id", "chassisNumber", "model", "batteryType", "batteryVendor", "hub", "registrationNumber", "inductedOn");
    private static final List<String> REQUIRED_HEADERS = List.of(
            "id", "chassisNumber", "model", "batteryType", "hub", "inductedOn");

    /**
     * The length each column accepts, taken from {@link CreateVehicleRequest}
     * so there is one set of numbers rather than two.
     *
     * <p>This path cannot use the bean-validation annotations that carry them:
     * those are applied by {@code @Valid} at the controller, and a commit
     * calls {@code VehicleService.create()} directly. Without this table an
     * over-long cell previewed as a valid row and then failed inside Postgres
     * at commit — which, because the commit is one transaction, rolled back
     * the whole file. The operator was told one row would import, got none,
     * and the message read "That value is already in use".
     */
    private static final Map<String, Integer> MAX_LENGTHS = Map.of(
            "id", CreateVehicleRequest.ID_MAX,
            "chassisNumber", CreateVehicleRequest.CHASSIS_NUMBER_MAX,
            "model", CreateVehicleRequest.MODEL_MAX,
            "batteryType", CreateVehicleRequest.BATTERY_TYPE_MAX,
            "batteryVendor", CreateVehicleRequest.BATTERY_VENDOR_MAX,
            "hub", CreateVehicleRequest.HUB_MAX,
            "registrationNumber", CreateVehicleRequest.REGISTRATION_NUMBER_MAX);

    private final VehicleImportRepository imports;
    private final VehicleImportRowRepository rows;
    private final VehicleRepository vehicles;
    private final VehicleService vehicleService;

    public VehicleImportService(VehicleImportRepository imports,
                                VehicleImportRowRepository rows,
                                VehicleRepository vehicles,
                                VehicleService vehicleService) {
        this.imports = imports;
        this.rows = rows;
        this.vehicles = vehicles;
        this.vehicleService = vehicleService;
    }

    @Transactional
    public BulkUploadPreviewResponse preview(MultipartFile file, UUID tenantId, UUID uploadedBy) {
        List<Map<String, String>> parsedRows = parse(file);
        if (parsedRows.isEmpty()) {
            throw new ValidationException("file", "The file has no data rows");
        }

        Map<String, Long> registryCounts = counts(parsedRows, "id");
        Map<String, Long> chassisCounts = counts(parsedRows, "chassisNumber");

        VehicleImport batch = new VehicleImport();
        batch.setTenantId(tenantId);
        batch.setFileName(file.getOriginalFilename() == null ? "vehicles.csv" : file.getOriginalFilename());
        batch.setUploadedBy(uploadedBy);
        batch.setStatus(VehicleImportStatus.PENDING);
        imports.save(batch);

        List<VehicleImportRow> stagedRows = new ArrayList<>();
        for (int i = 0; i < parsedRows.size(); i++) {
            Map<String, String> payload = parsedRows.get(i);
            VehicleImportRow row = new VehicleImportRow();
            row.setTenantId(tenantId);
            row.setImportId(batch.getId());
            row.setRowNumber(i + 1);
            row.setPayload(payload);
            row.setError(validateRow(payload, registryCounts, chassisCounts));
            stagedRows.add(rows.save(row));
        }

        int totalRows = stagedRows.size();
        int errorRows = (int) stagedRows.stream().filter(row -> row.getError() != null).count();
        int validRows = totalRows - errorRows;

        return new BulkUploadPreviewResponse(
                batch.getId().toString(),
                batch.getFileName(),
                totalRows,
                validRows,
                errorRows,
                stagedRows.stream().map(BulkUploadRowResponse::from).toList());
    }

    /**
     * Applies a previewed batch. Valid rows are created, errored rows are
     * skipped -- the preview already told the user which were which, and
     * refusing the whole file over one bad line would mean editing a
     * spreadsheet to import 199 good rows.
     *
     * <p>Each row goes through VehicleService.create(), not a bulk insert, so
     * bulk induction and single induction cannot drift: same validation, same
     * lifecycle row, same derived make.
     */
    @Transactional
    public ImportResultResponse commit(UUID importId, UUID tenantId, UUID actorUserId, String actorName) {
        VehicleImport batch = imports.findById(importId)
                .orElseThrow(() -> NotFoundException.of("Import", importId));
        if (batch.getStatus() != VehicleImportStatus.PENDING) {
            throw new ConflictException("This import has already been " + batch.getStatus().name().toLowerCase());
        }

        int imported = 0;
        List<SkippedRowResponse> skipped = new ArrayList<>();
        for (VehicleImportRow row : rows.findByImportIdOrderByRowNumberAsc(importId)) {
            if (row.getError() != null) {
                // Already reported in the preview. Counting it again here
                // would tell the operator twice about one problem.
                continue;
            }
            String stale = validateCommitRow(row.getPayload());
            if (stale != null) {
                // Previewed as importable and is not any more. The row keeps
                // the reason so a reopened import still explains itself.
                row.setError(stale);
                rows.save(row);
                skipped.add(SkippedRowResponse.of(row, stale));
                continue;
            }
            vehicleService.create(toCreateRequest(row.getPayload()), tenantId, actorUserId, actorName);
            imported++;
        }

        batch.setStatus(VehicleImportStatus.COMMITTED);
        batch.setCommittedOn(Instant.now());
        imports.save(batch);
        return new ImportResultResponse(imported, skipped.size(), List.copyOf(skipped));
    }

    /**
     * The checks both passes share: present, short enough, and a real date.
     *
     * <p>Ordered required-then-length so a blank cell is reported as missing
     * rather than as a length failure, and returning the first failure so the
     * operator gets the one sentence the screen has room for.
     */
    private String validateShape(Map<String, String> payload) {
        for (String header : REQUIRED_HEADERS) {
            if (blank(payload.get(header))) {
                return header + " is required";
            }
        }
        for (Map.Entry<String, Integer> limit : MAX_LENGTHS.entrySet()) {
            String value = payload.get(limit.getKey());
            // Trimmed, because create() trims before it inserts: a cell padded
            // to one past the limit is not actually too long for the column.
            if (value != null && value.trim().length() > limit.getValue()) {
                return limit.getKey() + " must be at most " + limit.getValue() + " characters";
            }
        }
        try {
            LocalDate.parse(payload.get("inductedOn").trim());
        } catch (DateTimeParseException ex) {
            return "inductedOn must be an ISO-8601 date";
        }
        return null;
    }

    private String validateRow(Map<String, String> payload,
                               Map<String, Long> registryCounts,
                               Map<String, Long> chassisCounts) {
        String shape = validateShape(payload);
        if (shape != null) {
            return shape;
        }

        String registryId = payload.get("id").trim();
        if (vehicles.findByRegistryId(registryId).isPresent()) {
            return "id already exists";
        }
        if (registryCounts.getOrDefault(registryId.toLowerCase(), 0L) > 1) {
            return "id is duplicated in the file";
        }

        String chassisNumber = payload.get("chassisNumber").trim();
        if (vehicles.findByChassisNumber(chassisNumber).isPresent()) {
            return "chassisNumber already exists";
        }
        if (chassisCounts.getOrDefault(chassisNumber.toLowerCase(), 0L) > 1) {
            return "chassisNumber is duplicated in the file";
        }
        return null;
    }

    /**
     * The same row, re-checked against the registry as it is now.
     *
     * <p>Only the facts that can change between the two steps are worth
     * re-reading — somebody else inducting the same bike while the preview is
     * on screen. The shape checks are repeated because they are cheap and
     * because a staged payload is read back from the database, not from the
     * request that validated it.
     *
     * <p>Trimmed on the way in: {@code validateRow} trims and so does
     * {@code VehicleService.create()}, and this used to not, so a padded cell
     * could pass here and then raise a 409 inside create() that aborted the
     * whole transaction.
     */
    private String validateCommitRow(Map<String, String> payload) {
        String shape = validateShape(payload);
        if (shape != null) {
            return shape;
        }
        if (vehicles.findByRegistryId(payload.get("id").trim()).isPresent()) {
            return "id already exists";
        }
        if (vehicles.findByChassisNumber(payload.get("chassisNumber").trim()).isPresent()) {
            return "chassisNumber already exists";
        }
        return null;
    }

    private List<Map<String, String>> parse(MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ValidationException("file", "Could not read the upload");
        }
        if (bytes.length == 0) {
            throw new ValidationException("file", "The file is empty");
        }

        // The content decides, not the extension. A browser sends whatever
        // the operating system has mapped, a user renames a file to .csv to
        // "fix" a failed upload, and an .xlsx always begins with the ZIP
        // signature. Sniffing the bytes gets all three right.
        List<List<String>> records;
        if (looksLikeXlsx(bytes)) {
            records = parseXlsx(bytes);
        } else {
            String raw = new String(bytes, StandardCharsets.UTF_8);
            if (raw.isBlank()) {
                throw new ValidationException("file", "The file is empty");
            }
            records = parseCsv(raw);
        }
        if (records.isEmpty()) {
            throw new ValidationException("file", "The file is empty");
        }

        List<String> header = records.get(0);
        for (String expected : HEADERS) {
            if (!header.contains(expected)) {
                throw new ValidationException("file", "The file is missing the " + expected + " column");
            }
        }
        if (records.size() == 1) {
            throw new ValidationException("file", "The file has no data rows");
        }

        List<Map<String, String>> rows = new ArrayList<>();
        for (int i = 1; i < records.size(); i++) {
            List<String> record = records.get(i);
            Map<String, String> payload = new LinkedHashMap<>();
            for (int c = 0; c < header.size(); c++) {
                payload.put(header.get(c), c < record.size() ? record.get(c) : "");
            }
            rows.add(payload);
        }
        return rows;
    }

    /** The ZIP local-file-header signature every .xlsx starts with. */
    private static boolean looksLikeXlsx(byte[] bytes) {
        return bytes.length >= 4
                && bytes[0] == 0x50 && bytes[1] == 0x4B
                && (bytes[2] == 0x03 || bytes[2] == 0x05 || bytes[2] == 0x07);
    }

    /**
     * The first sheet of a workbook, as the same rows {@link #parseCsv} would
     * have produced — so every rule downstream is blind to the file format.
     *
     * <p>Only the first sheet is read. A fleet export is one sheet, and
     * silently importing a second one (often a lookup list or a pivot) would
     * create bikes nobody asked for.
     */
    private static List<List<String>> parseXlsx(byte[] bytes) {
        try (Workbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            if (workbook.getNumberOfSheets() == 0) {
                throw new ValidationException("file", "The workbook has no sheets");
            }
            Sheet sheet = workbook.getSheetAt(0);
            DataFormatter formatter = new DataFormatter();
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();

            List<List<String>> records = new ArrayList<>();
            int lastRow = sheet.getLastRowNum();
            for (int r = sheet.getFirstRowNum(); r <= lastRow; r++) {
                Row row = sheet.getRow(r);
                if (row == null) {
                    // A row the user cleared. Excel keeps it in the used
                    // range; it is not a row of the import.
                    continue;
                }
                List<String> values = new ArrayList<>();
                for (int c = 0; c < row.getLastCellNum(); c++) {
                    values.add(readCell(row.getCell(c), formatter, evaluator));
                }
                if (values.stream().allMatch(String::isEmpty)) {
                    continue;
                }
                records.add(values);
            }
            return records;
        } catch (ValidationException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            // POI throws a family of unchecked exceptions for a file that is
            // not a workbook, is password protected, or is the older .xls
            // binary. The operator gets one sentence they can act on rather
            // than a parser class name.
            throw new ValidationException("file",
                    "Could not read that file as an Excel workbook. Save it as .xlsx or .csv and try again.");
        }
    }

    /**
     * One cell as the text a person would have typed.
     *
     * <p>Two cases make this more than {@code toString()}. A date cell holds
     * a serial number, so a date picked from Excel's own picker arrives as
     * 46266 and must go back out as 2026-09-01 for the ISO parse downstream.
     * And a registry id Excel decided was numeric would otherwise render as
     * 1.23457E+11, so a whole number is written without the exponent or the
     * trailing .0 the default format adds.
     */
    private static String readCell(Cell cell, DataFormatter formatter, FormulaEvaluator evaluator) {
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

    private static List<List<String>> parseCsv(String raw) {
        List<List<String>> rows = new ArrayList<>();
        List<String> currentRow = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (ch == '"') {
                if (inQuotes && i + 1 < raw.length() && raw.charAt(i + 1) == '"') {
                    current.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch == ',' && !inQuotes) {
                currentRow.add(current.toString().trim());
                current.setLength(0);
            } else if ((ch == '\n' || ch == '\r') && !inQuotes) {
                if (ch == '\r' && i + 1 < raw.length() && raw.charAt(i + 1) == '\n') {
                    i++;
                }
                currentRow.add(current.toString().trim());
                current.setLength(0);
                if (!currentRow.stream().allMatch(String::isEmpty)) {
                    rows.add(currentRow);
                }
                currentRow = new ArrayList<>();
            } else {
                current.append(ch);
            }
        }

        currentRow.add(current.toString().trim());
        if (!currentRow.stream().allMatch(String::isEmpty)) {
            rows.add(currentRow);
        }
        return rows;
    }

    private static Map<String, Long> counts(List<Map<String, String>> rows, String key) {
        return rows.stream()
                .map(row -> row.getOrDefault(key, "").trim().toLowerCase())
                .filter(value -> !value.isBlank())
                .collect(Collectors.groupingBy(value -> value, Collectors.counting()));
    }

    private static CreateVehicleRequest toCreateRequest(Map<String, String> payload) {
        return new CreateVehicleRequest(
                payload.get("id"),
                payload.get("chassisNumber"),
                payload.get("model"),
                payload.get("batteryType"),
                payload.get("batteryVendor"),
                payload.get("hub"),
                payload.get("registrationNumber"),
                LocalDate.parse(payload.get("inductedOn")));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
