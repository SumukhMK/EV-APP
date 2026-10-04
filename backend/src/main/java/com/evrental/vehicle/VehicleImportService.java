package com.evrental.vehicle;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.payment.BillingClock;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class VehicleImportService {

    /** The columns a row carries. Owned by the header matcher; re-exported for the template. */
    static final List<String> HEADERS = HeaderMatcher.COLUMNS;
    private static final List<String> REQUIRED_HEADERS = List.of(
            "id", "chassisNumber", "model", "batteryType", "hub", "inductedOn");

    /**
     * The most rows one file may carry.
     *
     * <p>Every row is staged as its own database row and sent back in the
     * preview, so a file is bounded by what one request and one screen can
     * hold, not by what Excel can. The fleet being migrated is 150 bikes;
     * 2,000 leaves room for a year of growth in one file and keeps the
     * preview under a second.
     */
    static final int MAX_ROWS = 2_000;

    /** How long a preview stays committable. The nightly sweeper uses the same figure. */
    static final Duration PREVIEW_TTL = Duration.ofHours(24);

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
    private final BillingClock clock;

    public VehicleImportService(VehicleImportRepository imports,
                                VehicleImportRowRepository rows,
                                VehicleRepository vehicles,
                                VehicleService vehicleService,
                                BillingClock clock) {
        this.imports = imports;
        this.rows = rows;
        this.vehicles = vehicles;
        this.vehicleService = vehicleService;
        this.clock = clock;
    }

    /**
     * How many files may be parsed at once.
     *
     * <p>Every other request's memory is set by the database; this one's is
     * set by whoever uploaded the file. The reader bounds one file by its
     * own constants, so two at a time bounds the server — a third waits for
     * a slot, and after {@link #PARSE_WAIT} is told to come back. One
     * operator never sees that; five people uploading the same minute do,
     * instead of taking the instance down between them.
     */
    private static final Semaphore PARSERS = new Semaphore(2);
    private static final Duration PARSE_WAIT = Duration.ofSeconds(15);

    @Transactional
    public BulkUploadPreviewResponse preview(MultipartFile file, UUID tenantId, UUID uploadedBy) {
        Parsed parsed = parseWithinSlot(file);
        List<Map<String, String>> parsedRows = parsed.rows();

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
                parsed.sheetName(),
                parsed.ignoredColumns(),
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
        // The sweeper marks these EXPIRED once a night. Between the preview
        // turning a day old and that run, the age is checked here, so the
        // promise "a preview lasts 24 hours" is exact rather than "until
        // about 03:15 the following morning".
        if (batch.getUploadedOn().isBefore(Instant.now().minus(PREVIEW_TTL))) {
            throw new ConflictException("This preview has expired. Upload the file again.");
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
     * The checks both passes share: present, short enough, a real date that
     * has happened.
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
        Optional<LocalDate> inductedOn = ImportDates.parse(payload.get("inductedOn"));
        if (inductedOn.isEmpty()) {
            return "inductedOn must be a date like " + ImportDates.HINT;
        }
        // A bike cannot have joined the fleet next month. Today is today in
        // IST, where the fleet is — not in the UTC the container runs in.
        if (inductedOn.get().isAfter(clock.today())) {
            return "inductedOn cannot be in the future";
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

    /** The file as rows keyed by field, plus what the preview says about where they came from. */
    private record Parsed(List<Map<String, String>> rows, String sheetName, List<String> ignoredColumns) {
    }

    /**
     * Bytes to rows keyed by field name.
     *
     * <p>Three steps, each its own class with its own tests: the reader turns
     * any supported format into rows of text, the matcher finds the header
     * among them and names the columns, and this method picks each field out
     * of each row by that mapping. A date is normalised to ISO here when it
     * parses, so the stored payload is one shape; one that does not parse is
     * kept as typed so the row error can quote it.
     */
    private Parsed parseWithinSlot(MultipartFile file) {
        boolean acquired;
        try {
            acquired = PARSERS.tryAcquire(PARSE_WAIT.toSeconds(), TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ImportBusyException();
        }
        if (!acquired) {
            throw new ImportBusyException();
        }
        try {
            return parse(file);
        } finally {
            PARSERS.release();
        }
    }

    private Parsed parse(MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ImportFileException("Could not read the upload");
        }
        // The cap plus the rows the header may hide behind, plus one: the
        // reader stops there, so a 200,000-row file costs what a 2,011-row
        // file costs, and "truncated" is how it says there was more.
        ImportFile parsed = ImportFileReader.read(bytes, MAX_ROWS + HeaderMatcher.SCAN_ROWS + 1);
        HeaderMatch header = HeaderMatcher.locate(parsed.rows());
        List<List<String>> records = parsed.rows().subList(header.headerRow() + 1, parsed.rows().size());

        if (records.isEmpty()) {
            throw new ImportFileException("The file has no data rows");
        }
        if (parsed.truncated() || records.size() > MAX_ROWS) {
            throw new ImportFileException(
                    String.format("The file has more than %,d rows. The maximum is %,d — split it into smaller files.",
                            MAX_ROWS, MAX_ROWS),
                    Map.of("maxRows", MAX_ROWS));
        }

        List<Map<String, String>> rows = new ArrayList<>(records.size());
        for (List<String> record : records) {
            Map<String, String> payload = new LinkedHashMap<>();
            for (String field : HEADERS) {
                int column = header.columns().get(field);
                payload.put(field, column < record.size() ? record.get(column).trim() : "");
            }
            ImportDates.parse(payload.get("inductedOn"))
                    .ifPresent(date -> payload.put("inductedOn", date.format(DateTimeFormatter.ISO_LOCAL_DATE)));
            rows.add(payload);
        }
        return new Parsed(rows, parsed.sheetName(), header.ignored());
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
