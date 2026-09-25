package com.evrental.vehicle;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class VehicleImportService {

    private static final List<String> HEADERS = List.of(
            "id", "chassisNumber", "model", "batteryType", "batteryVendor", "hub", "registrationNumber", "inductedOn");
    private static final List<String> REQUIRED_HEADERS = List.of(
            "id", "chassisNumber", "model", "batteryType", "hub", "inductedOn");

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
        for (VehicleImportRow row : rows.findByImportIdOrderByRowNumberAsc(importId)) {
            if (row.getError() != null) {
                continue;
            }
            if (validateCommitRow(row.getPayload()) != null) {
                continue;
            }
            vehicleService.create(toCreateRequest(row.getPayload()), tenantId, actorUserId, actorName);
            imported++;
        }

        batch.setStatus(VehicleImportStatus.COMMITTED);
        batch.setCommittedOn(Instant.now());
        imports.save(batch);
        return new ImportResultResponse(imported);
    }

    private String validateRow(Map<String, String> payload,
                               Map<String, Long> registryCounts,
                               Map<String, Long> chassisCounts) {
        for (String header : REQUIRED_HEADERS) {
            if (blank(payload.get(header))) {
                return header + " is required";
            }
        }
        try {
            LocalDate.parse(payload.get("inductedOn"));
        } catch (DateTimeParseException ex) {
            return "inductedOn must be an ISO-8601 date";
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

    private String validateCommitRow(Map<String, String> payload) {
        for (String header : REQUIRED_HEADERS) {
            if (blank(payload.get(header))) {
                return header + " is required";
            }
        }
        try {
            LocalDate.parse(payload.get("inductedOn"));
        } catch (DateTimeParseException ex) {
            return "inductedOn must be an ISO-8601 date";
        }
        if (vehicles.findByRegistryId(payload.get("id")).isPresent()) {
            return "id already exists";
        }
        if (vehicles.findByChassisNumber(payload.get("chassisNumber")).isPresent()) {
            return "chassisNumber already exists";
        }
        return null;
    }

    private List<Map<String, String>> parse(MultipartFile file) {
        String raw;
        try {
            raw = new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ValidationException("file", "Could not read the upload");
        }
        if (raw.isBlank()) {
            throw new ValidationException("file", "The file is empty");
        }

        List<List<String>> records = parseCsv(raw);
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
