package com.evrental.platform;

import com.evrental.common.AadhaarCipher;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Loads the demo fleet — the same 137 bikes the frontend fixtures draw.
 *
 * <p>The CSV is generated from those fixtures by
 * {@code frontend/app/scripts/export-fleet-seed.mjs}, on purpose. A second,
 * plausible-looking fleet invented here would make every difference after a
 * screen is wired ambiguous: a data difference, or a defect, with no way to
 * tell them apart. With one source, a difference is a defect.
 *
 * <p>Not a Flyway migration. Migrations are schema, and this is demo content
 * that a real deployment must be able to leave out entirely — it is gated on
 * {@code app.bootstrap.seed-fleet}, which only the local profile sets.
 *
 * <p>Idempotent by the crudest test available: if the tenant already has any
 * vehicle, it does nothing. Per-row upserts would let a half-finished earlier
 * run leave a fleet that is neither the fixture's nor anyone's.
 *
 * <p>Runs after {@link BootstrapData}, which creates the tenant this fills,
 * and under the super-admin sentinel, because writing another tenant's rows is
 * a cross-tenant write that RLS would otherwise refuse.
 */
@Component
@Order(20)
public class DevFleetSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevFleetSeeder.class);
    private static final String SEED_PATH = "db/seed/fleet.csv";
    private static final String SEED_ACTOR = "Fleet import";

    private final TenantRepository tenants;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AadhaarCipher aadhaarCipher;
    private final boolean enabled;
    private final String tenantSlug;

    public DevFleetSeeder(
            TenantRepository tenants,
            JdbcTemplate jdbc,
            PlatformTransactionManager txManager,
            AadhaarCipher aadhaarCipher,
            @Value("${app.bootstrap.seed-fleet:false}") boolean enabled,
            @Value("${app.bootstrap.seed-fleet-tenant:g1-mobility}") String tenantSlug) {
        this.tenants = tenants;
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.aadhaarCipher = aadhaarCipher;
        this.enabled = enabled;
        this.tenantSlug = tenantSlug;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        tx.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT set_config('app.tenant_id', '*', true)", String.class);

            UUID tenantId = tenants.findBySlugIgnoreCase(tenantSlug)
                    .map(Tenant::getId)
                    .orElse(null);
            if (tenantId == null) {
                log.warn("Fleet seed: no tenant '{}' — nothing to seed into", tenantSlug);
                return;
            }

            Integer existing = jdbc.queryForObject(
                    "SELECT count(*) FROM vehicles WHERE tenant_id = ?", Integer.class, tenantId);
            if (existing != null && existing > 0) {
                log.info("Fleet seed: tenant '{}' already has {} vehicles — skipping", tenantSlug, existing);
                return;
            }

            List<String[]> rows = readSeed();
            for (String[] row : rows) {
                insert(tenantId, row);
            }
            log.info("Fleet seed: loaded {} vehicles into '{}'", rows.size(), tenantSlug);

            seedRiders(tenantId);
        });
    }

    private void insert(UUID tenantId, String[] r) {
        UUID vehicleId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO vehicles (
                    id, tenant_id, registry_id, chassis_number, model, make,
                    battery_type, battery_vendor, hub, state,
                    registration_number, odometer_km, inducted_on)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                vehicleId, tenantId, r[0], r[1], r[2], r[3],
                r[4], blankToNull(r[5]), r[6], r[7],
                blankToNull(r[8]), intOrNull(r[9]), LocalDate.parse(r[10]));

        // Induction is a transition from nothing, and the detail screen reads
        // this history. A vehicle in the table with no event would render as a
        // bike that appeared from nowhere.
        jdbc.update("""
                INSERT INTO vehicle_lifecycle_events (
                    tenant_id, vehicle_id, from_state, to_state, note, actor_user_id, actor_name, occurred_on)
                VALUES (?,?,NULL,'INDUCTED','Seeded demo fleet',NULL,?,?)
                """,
                tenantId, vehicleId, SEED_ACTOR, LocalDate.parse(r[10]).atStartOfDay()
                        .atZone(java.time.ZoneOffset.UTC).toOffsetDateTime());

        // A bike that is not still INDUCTED got there somehow. One summarising
        // event is honest about being a seed; a fabricated step-by-step history
        // would read as real operational record.
        if (!"INDUCTED".equals(r[7])) {
            jdbc.update("""
                    INSERT INTO vehicle_lifecycle_events (
                        tenant_id, vehicle_id, from_state, to_state, note, actor_user_id, actor_name)
                    VALUES (?,?,'INDUCTED',?,'Seeded demo fleet',NULL,?)
                    """,
                    tenantId, vehicleId, r[7], SEED_ACTOR);
        }
    }

    /**
     * Reads the generated CSV. The exporter quotes only when a value contains a
     * comma, quote, or newline, and no fleet field ever does — so a split on
     * commas would work today and break silently the first time a hub is named
     * "Whitefield, North". This unquotes properly instead.
     */
    private List<String[]> readSeed() {
        ClassPathResource resource = new ClassPathResource(SEED_PATH);
        if (!resource.exists()) {
            log.warn("Fleet seed: {} not found — run `npm run seed:export`", SEED_PATH);
            return List.of();
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            List<String[]> rows = new ArrayList<>();
            reader.readLine(); // header
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank()) {
                    rows.add(parseCsvLine(line));
                }
            }
            return rows;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + SEED_PATH, e);
        }
    }

    /** Package-private would be tidier, but the tests live in {@code com.evrental}. */
    public static String[] parseCsvLine(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (quoted) {
                if (c != '"') {
                    cell.append(c);
                } else if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else {
                    quoted = false;
                }
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(c);
            }
        }
        cells.add(cell.toString());
        return cells.toArray(String[]::new);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Object intOrNull(String value) {
        return value == null || value.isBlank()
                ? new org.springframework.jdbc.core.SqlParameterValue(Types.INTEGER, null)
                : Integer.valueOf(value);
    }

    // -----------------------------------------------------------------------
    // Riders (S2)
    // -----------------------------------------------------------------------

    /**
     * The ten designed riders from mocks/riders.ts — same names, phones,
     * plans, billing days, platforms, payment days and deposits, so the wired
     * register and the mock register agree on the rows a screen is drawn
     * against. vehicleId and paymentStatus are deliberately not seeded:
     * assignment is S5 and payment status is derived by S6, so the register
     * answers PENDING with no bike until then.
     *
     * <p>Payment modes are not in the mock's designed rows (they are picked
     * randomly there); a fixed spread is seeded instead, weighted the way the
     * counter sees them — UPI the norm, cash common, a transfer the exception.
     *
     * <p>Aadhaar numbers are not in the mock either (the mock's Rider type has
     * no such field); each rider gets a deterministic fake 12-digit number
     * (phone + "01"), stored encrypted like every other Aadhaar.
     */
    private static final List<RiderSeed> RIDER_SEED = List.of(
            new RiderSeed("Dulan Hajong", "8453679575", 1750, 3000, "MONDAY", "Zomato", "MONDAY", "UPI", "845367957501"),
            new RiderSeed("Raju Debnath", "9862340117", 1999, 3000, "WEDNESDAY", "Zepto", "WEDNESDAY", "UPI", "986234011701"),
            new RiderSeed("Ashwin Kamath", "9945128830", 1900, 3000, "MONDAY", "Swiggy", "TUESDAY", "UPI", "994512883001"),
            new RiderSeed("Nabam Tada", "8974551206", 2099, 5000, "WEDNESDAY", "Blinkit", "THURSDAY", "CASH", "897455120601"),
            new RiderSeed("Imran Shaikh", "7760043915", 1700, 3000, "MONDAY", "Swiggy Instamart", "FRIDAY", "UPI", "776004391501"),
            new RiderSeed("Lalit Chhetri", "8014772390", 1600, 2000, "WEDNESDAY", "Porter", "SATURDAY", "CASH", "801477239001"),
            new RiderSeed("Sohail Ahmed", "9008216744", 1950, 3000, "MONDAY", "Flipkart Minutes", "SUNDAY", "UPI", "900821674401"),
            new RiderSeed("Prakash Bhandari", "9611308452", 1750, 3000, "WEDNESDAY", "Dunzo", "MONDAY", "UPI", "961130845201"),
            new RiderSeed("Yash Karkera", "9535667021", 1999, 3000, "MONDAY", "Zomato", "WEDNESDAY", "BANK_TRANSFER", "953566702101"),
            new RiderSeed("Girish Poojary", "8899140563", 1700, 2000, "WEDNESDAY", "EatSure", "FRIDAY", "CASH", "889914056301"));

    private record RiderSeed(String name, String phone, long planRupees, long depositRupees,
                             String billingDay, String platform, String paymentDay, String paymentMode,
                             String aadhaar) {
    }

    /**
     * Idempotent by the same crude test as the fleet: if the tenant already
     * has any rider, it does nothing. Runs inside the same transaction and
     * under the same super-admin sentinel as the vehicle seed.
     */
    private void seedRiders(UUID tenantId) {
        Integer existing = jdbc.queryForObject(
                "SELECT count(*) FROM riders WHERE tenant_id = ?", Integer.class, tenantId);
        if (existing != null && existing > 0) {
            log.info("Fleet seed: tenant '{}' already has {} riders — skipping", tenantSlug, existing);
            return;
        }
        for (RiderSeed r : RIDER_SEED) {
            insertRider(tenantId, r);
        }
        log.info("Fleet seed: loaded {} riders into '{}'", RIDER_SEED.size(), tenantSlug);
    }

    private void insertRider(UUID tenantId, RiderSeed r) {
        jdbc.update("""
                INSERT INTO riders (
                    id, tenant_id, name, phone, status, kyc_status,
                    plan_amount_paise, deposit_held_paise, billing_day, payment_day,
                    payment_mode, platform, onboarded_on,
                    aadhaar_verified, primary_verified, whatsapp_verified, alternate1_verified,
                    aadhaar_encrypted)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                UUID.randomUUID(), tenantId, r.name(), r.phone(), "ACTIVE", "VERIFIED",
                r.planRupees() * 100, r.depositRupees() * 100, r.billingDay(), r.paymentDay(),
                r.paymentMode(), r.platform(), LocalDate.parse("2026-04-08"),
                true, true, true, true,
                aadhaarCipher.encrypt(r.aadhaar()));
    }
}
