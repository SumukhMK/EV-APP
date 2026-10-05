package com.evrental.platform;

import com.evrental.common.AadhaarCipher;
import com.evrental.rider.RiderCodes;
import com.evrental.service.ServiceJobCodes;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.sql.Types;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The demo tenant's data, the way a fleet that has been running for a few
 * months actually looks: 137 bikes in every state, riders on them and off
 * them, jobs in every queue with cost lines and a QC history, eight weeks of
 * billing with paid, partial and overdue weeks, charges open and settled, a
 * settlement waiting for approval, and an audit trail behind all of it.
 *
 * <p>Not a Flyway migration. Migrations are schema; this is demo content a
 * real deployment must be able to leave out entirely, so it is gated on
 * {@code app.bootstrap.seed-fleet}, which only the local profile sets. A
 * production boot never reaches the first query here.
 *
 * <p>Idempotent by the crudest test: if the tenant already has any vehicle,
 * nothing happens. {@code app.bootstrap.reseed=true} is the one exception —
 * it wipes the demo tenant's operational rows (and the platform tenant's,
 * where a developer's own test data accumulates) and loads everything fresh,
 * moving the platform admin into the demo tenant so a developer signed in as
 * her sees the data. It is meant for one run from the command line, not for
 * the profile file: a stack that resets itself on every restart would lose
 * whatever a tester had just reproduced.
 *
 * <p>The fleet itself still comes from {@code db/seed/fleet.csv}, generated
 * from the frontend fixtures by {@code frontend/app/scripts/export-fleet-seed.mjs},
 * so the wired screens and the mock screens draw the same bikes.
 *
 * <p>Every date is relative to today in Asia/Kolkata, so the data reads as
 * current whenever it is loaded — a week that was "last week" on the day
 * this was written is still last week next month.
 *
 * <p>Runs after {@link BootstrapData}, which creates the tenant and the demo
 * users this fills in around, under the super-admin sentinel because the rows
 * belong to another tenant than the one the connection would default to.
 */
@Component
@Order(20)
public class DevFleetSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevFleetSeeder.class);
    private static final String SEED_PATH = "db/seed/fleet.csv";
    private static final String SEED_ACTOR = "Fleet import";
    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AadhaarCipher aadhaarCipher;
    private final RiderCodes riderCodes;
    private final ServiceJobCodes jobCodes;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;
    private final boolean reseed;
    private final String tenantSlug;
    private final String adminEmail;
    private final String demoPassword;

    public DevFleetSeeder(
            JdbcTemplate jdbc,
            PlatformTransactionManager txManager,
            AadhaarCipher aadhaarCipher,
            RiderCodes riderCodes,
            ServiceJobCodes jobCodes,
            PasswordEncoder passwordEncoder,
            @Value("${app.bootstrap.seed-fleet:false}") boolean enabled,
            @Value("${app.bootstrap.reseed:false}") boolean reseed,
            @Value("${app.bootstrap.seed-fleet-tenant:g1-mobility}") String tenantSlug,
            @Value("${app.bootstrap.admin-email:}") String adminEmail,
            @Value("${app.bootstrap.demo-password:}") String demoPassword) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.aadhaarCipher = aadhaarCipher;
        this.riderCodes = riderCodes;
        this.jobCodes = jobCodes;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
        this.reseed = reseed;
        this.tenantSlug = tenantSlug;
        this.adminEmail = adminEmail;
        this.demoPassword = demoPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        tx.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT set_config('app.tenant_id', '*', true)", String.class);
            UUID tenantId = jdbc.query("SELECT id FROM tenants WHERE lower(slug) = lower(?)",
                    (rs, i) -> rs.getObject(1, UUID.class), tenantSlug).stream().findFirst().orElse(null);
            if (tenantId == null) {
                log.warn("Fleet seed: no tenant '{}' — nothing to seed into", tenantSlug);
                return;
            }
            if (reseed) {
                wipe(tenantId);
                wipe(BootstrapData.PLATFORM_TENANT_ID);
                moveAdminInto(tenantId);
            }
            Integer existing = jdbc.queryForObject(
                    "SELECT count(*) FROM vehicles WHERE tenant_id = ?", Integer.class, tenantId);
            if (existing != null && existing > 0) {
                log.info("Fleet seed: tenant '{}' already has {} vehicles — skipping", tenantSlug, existing);
                return;
            }
            new Load(tenantId).all();
        });
    }

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------

    /** Children first, in foreign-key order. Users and tenants stay. */
    private void wipe(UUID tenantId) {
        String[] tables = {
            "payment_collections", "rider_charges", "payment_periods",
            "qc_inspections", "service_job_items", "service_job_events", "service_jobs",
            "assignments", "rider_plan_changes", "riders",
            "vehicle_import_rows", "vehicle_imports", "vehicle_lifecycle_events", "vehicles",
            "hubs", "vehicle_models", "user_role_changes", "refresh_tokens",
            "rider_code_counters", "job_code_counters", "receipt_counters",
        };
        int rows = 0;
        for (String table : tables) {
            rows += jdbc.update("DELETE FROM " + table + " WHERE tenant_id = ?", tenantId);
        }
        log.info("Fleet seed: reseed wiped {} rows from tenant {}", rows, tenantId);
    }

    /** The platform admin works the demo tenant locally, so she sees what was seeded. */
    private void moveAdminInto(UUID tenantId) {
        if (adminEmail == null || adminEmail.isBlank()) {
            return;
        }
        int moved = jdbc.update("UPDATE users SET tenant_id = ? WHERE lower(email) = lower(?) AND tenant_id <> ?",
                tenantId, adminEmail.trim(), tenantId);
        if (moved > 0) {
            log.info("Fleet seed: moved {} into tenant '{}' — sign in again", adminEmail, tenantSlug);
        }
    }

    // -----------------------------------------------------------------------
    // The load, in dependency order
    // -----------------------------------------------------------------------

    /** One load of one tenant; holds the ids the later steps refer back to. */
    private final class Load {
        private final UUID tenantId;
        private final LocalDate today = LocalDate.now(ZONE);
        private final Map<String, UUID> vehicles = new LinkedHashMap<>();
        private final Map<String, String> vehicleState = new HashMap<>();
        private final List<RiderRow> riders = new ArrayList<>();
        private final Map<String, UUID> users = new HashMap<>();
        private int jobs;
        private int periods;
        private int collections;

        Load(UUID tenantId) {
            this.tenantId = tenantId;
        }

        void all() {
            vehicles();
            referenceData();
            users();
            riders();
            assignments();
            serviceJobs();
            billing();
            auditTrail();
            log.info("Fleet seed: '{}' loaded — {} bikes, {} riders, {} jobs, {} billing periods, {} collections",
                    tenantSlug, vehicles.size(), riders.size(), jobs, periods, collections);
        }

        // -- bikes -----------------------------------------------------------

        private void vehicles() {
            for (String[] r : readSeed()) {
                UUID id = UUID.randomUUID();
                jdbc.update("""
                        INSERT INTO vehicles (
                            id, tenant_id, registry_id, chassis_number, model, make,
                            battery_type, battery_vendor, hub, state,
                            registration_number, odometer_km, inducted_on)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        id, tenantId, r[0], r[1], r[2], r[3], r[4], blankToNull(r[5]), r[6], r[7],
                        blankToNull(r[8]), intOrNull(r[9]), LocalDate.parse(r[10]));
                lifecycle(id, null, "INDUCTED", "Inducted into the fleet", SEED_ACTOR, at(LocalDate.parse(r[10]), 10));
                if (!"INDUCTED".equals(r[7])) {
                    lifecycle(id, "INDUCTED", r[7], "State at the time of the fleet import", SEED_ACTOR,
                            at(LocalDate.parse(r[10]).plusDays(7), 11));
                }
                vehicles.put(r[0], id);
                vehicleState.put(r[0], r[7]);
            }
            // Two bikes have reached the end of the road, so the register has
            // the one state the CSV never carries.
            int retired = 0;
            for (String registryId : new ArrayList<>(vehicles.keySet())) {
                if (retired == 2) {
                    break;
                }
                if ("READY_TO_DEPLOY".equals(vehicleState.get(registryId))) {
                    jdbc.update("UPDATE vehicles SET state = 'RETIRED' WHERE id = ?", vehicles.get(registryId));
                    lifecycle(vehicles.get(registryId), "READY_TO_DEPLOY", "RETIRED",
                            retired == 0 ? "Written off — frame cracked beyond repair" : "Sold at end of life",
                            "Meenakshi Iyer", at(today.minusDays(20 + retired * 9), 15));
                    vehicleState.put(registryId, "RETIRED");
                    retired++;
                }
            }
        }

        private void referenceData() {
            jdbc.update("""
                    INSERT INTO hubs (tenant_id, name)
                    SELECT DISTINCT v.tenant_id, v.hub FROM vehicles v
                    WHERE v.tenant_id = ? AND NOT EXISTS (SELECT 1 FROM hubs h WHERE h.tenant_id = v.tenant_id AND h.name = v.hub)
                    """, tenantId);
            jdbc.update("""
                    INSERT INTO vehicle_models (tenant_id, name, make)
                    SELECT DISTINCT v.tenant_id, v.model, v.make FROM vehicles v
                    WHERE v.tenant_id = ? AND NOT EXISTS (SELECT 1 FROM vehicle_models m WHERE m.tenant_id = v.tenant_id AND m.name = v.model)
                    """, tenantId);
        }

        // -- people ----------------------------------------------------------

        /** The demo personas BootstrapData made, plus two more so every role has a second person. */
        private void users() {
            for (Map<String, Object> row : jdbc.queryForList(
                    "SELECT id, name FROM users WHERE tenant_id = ?", tenantId)) {
                users.put((String) row.get("name"), (UUID) row.get("id"));
            }
            if (demoPassword != null && !demoPassword.isBlank()) {
                ensureUser("Rohan Verma", "rohan@g1mobility.in", "FLEET_STAFF");
                ensureUser("Kavya Nair", "kavya@g1mobility.in", "SERVICE_MANAGER");
            }
        }

        private void ensureUser(String name, String email, String role) {
            Integer exists = jdbc.queryForObject("SELECT count(*) FROM users WHERE lower(email) = lower(?)", Integer.class, email);
            if (exists != null && exists > 0) {
                return;
            }
            UUID id = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, last_active_at)
                    VALUES (?,?,?,?,?,?,'ACTIVE',?)
                    """, id, tenantId, name, email, passwordEncoder.encode(demoPassword), role, at(today.minusDays(1), 18));
            users.put(name, id);
        }

        private UUID userId(String name) {
            return users.get(name);
        }

        private record RiderSeed(String name, String phone, String alt, long planRupees, long depositRupees,
                                 long depositPaidRupees, String billingDay, String paymentDay, String mode,
                                 String platform, String kyc, String pan, String dl,
                                 String localAddress, String city, String state, String pin, int onboardedDaysAgo) {
        }

        private record RiderRow(UUID id, String code, RiderSeed seed, UUID bikeId, String bikeRegistryId,
                                LocalDate assignedOn) {
        }

        /**
         * Twenty-four riders. The first sixteen hold bikes (ACTIVE); then three
         * freshly onboarded and three who handed a bike back (INACTIVE). Every
         * plan, billing day, payment day, payment mode, platform and KYC state
         * the forms offer appears at least once; most have a PAN and a licence,
         * a few do not; one paid only part of the deposit.
         */
        private List<RiderSeed> riderSeeds() {
            return List.of(
                new RiderSeed("Dulan Hajong", "8453679575", "8453679576", 1750, 3000, 3000, "MONDAY", "MONDAY", "UPI", "Zomato", "VERIFIED", "AKJPH4821L", "KA0320210045612", "22, 4th Cross, Kadugodi", "Bengaluru", "Karnataka", "560067", 180),
                new RiderSeed("Raju Debnath", "9862340117", "9862340118", 1999, 3000, 3000, "WEDNESDAY", "WEDNESDAY", "UPI", "Zepto", "VERIFIED", "BNRPD7730Q", "KA5120190098231", "7, Ambedkar Nagar, Marathahalli", "Bengaluru", "Karnataka", "560037", 170),
                new RiderSeed("Ashwin Kamath", "9945128830", "9945128831", 1900, 3000, 3000, "MONDAY", "TUESDAY", "UPI", "Swiggy", "VERIFIED", "CTAPK2210M", "KA0520180034567", "118, HSR Layout Sector 2", "Bengaluru", "Karnataka", "560102", 160),
                new RiderSeed("Nabam Tada", "8974551206", "8974551207", 2099, 5000, 5000, "WEDNESDAY", "THURSDAY", "CASH", "Blinkit", "VERIFIED", null, "KA0120220011234", "3, Hoodi Main Road", "Bengaluru", "Karnataka", "560048", 150),
                new RiderSeed("Imran Shaikh", "7760043915", "7760043916", 1700, 3000, 3000, "MONDAY", "FRIDAY", "UPI", "Swiggy Instamart", "VERIFIED", "DWSPS9087R", "KA0220200067890", "45, Koramangala 5th Block", "Bengaluru", "Karnataka", "560095", 140),
                new RiderSeed("Lalit Chhetri", "8014772390", "8014772391", 1600, 2000, 2000, "WEDNESDAY", "SATURDAY", "CASH", "Porter", "VERIFIED", "EKMPC3345N", null, "9, Bellandur Gate", "Bengaluru", "Karnataka", "560103", 130),
                new RiderSeed("Sohail Ahmed", "9008216744", "9008216745", 1950, 3000, 3000, "MONDAY", "SUNDAY", "UPI", "Flipkart Minutes", "VERIFIED", "FJTPA5567K", "KA0420170023456", "12, Whitefield Main Road", "Bengaluru", "Karnataka", "560066", 120),
                new RiderSeed("Prakash Bhandari", "9611308452", "9611308453", 1750, 3000, 3000, "WEDNESDAY", "MONDAY", "UPI", "Dunzo", "VERIFIED", "GHRPB1123P", "KA5320210078901", "61, BTM Layout 2nd Stage", "Bengaluru", "Karnataka", "560076", 110),
                new RiderSeed("Yash Karkera", "9535667021", "9535667022", 1999, 3000, 3000, "MONDAY", "WEDNESDAY", "BANK_TRANSFER", "Zomato", "VERIFIED", "HLKPK8890A", "KA0120190045678", "28, Varthur Kodi", "Bengaluru", "Karnataka", "560087", 100),
                new RiderSeed("Girish Poojary", "8899140563", "8899140564", 1700, 2000, 2000, "WEDNESDAY", "FRIDAY", "CASH", "EatSure", "VERIFIED", null, null, "5, Mahadevapura", "Bengaluru", "Karnataka", "560048", 95),
                new RiderSeed("Mohammed Rafi", "9900112233", "9900112234", 1800, 3000, 3000, "MONDAY", "MONDAY", "UPI", "Zomato", "VERIFIED", "IMNPR4456C", "KA0320200056789", "77, Sarjapur Road", "Bengaluru", "Karnataka", "560035", 80),
                new RiderSeed("Santhosh Kumar R", "9731456789", "9731456780", 1650, 3000, 3000, "WEDNESDAY", "TUESDAY", "UPI", "Swiggy", "PENDING", "JNOPK7789D", "KA0520210012345", "14, Hosur Road, Bommanahalli", "Bengaluru", "Karnataka", "560068", 60),
                new RiderSeed("Vikram Jadhav", "8884420011", "8884420012", 1900, 3000, 3000, "MONDAY", "THURSDAY", "BANK_TRANSFER", "Amazon", "VERIFIED", "KOPPJ2234E", "KA0120180089012", "33, Kundalahalli", "Bengaluru", "Karnataka", "560037", 55),
                new RiderSeed("Bhaskar Reddy", "9550011223", "9550011224", 1750, 3000, 1000, "WEDNESDAY", "WEDNESDAY", "UPI", "Zepto", "VERIFIED", "LPQPR5567F", "TN2920190034567", "Plot 8, Bagalur Road", "Hosur", "Tamil Nadu", "635109", 45),
                new RiderSeed("Deepak Rawat", "9632188054", "9632188055", 1999, 3000, 3000, "MONDAY", "TUESDAY", "UPI", "Blinkit", "PENDING", null, "KA5120220067890", "19, Panathur", "Bengaluru", "Karnataka", "560103", 30),
                new RiderSeed("Faisal Khan", "7012238890", "7012238891", 1900, 3000, 3000, "WEDNESDAY", "WEDNESDAY", "UPI", "Swiggy", "VERIFIED", "MQRPK8890G", "KA0220190078901", "40, Kaggadasapura", "Bengaluru", "Karnataka", "560093", 21),
                // On the register, no bike yet.
                new RiderSeed("Anil Shetty", "9845012277", "9845012278", 1750, 3000, 3000, "MONDAY", "MONDAY", "UPI", "Zomato", "VERIFIED", "NRSPS1123H", "KA0320220089012", "8, Doddanekundi", "Bengaluru", "Karnataka", "560037", 3),
                new RiderSeed("Kiran Rao", "9845012288", "9845012289", 1900, 3000, 3000, "MONDAY", "TUESDAY", "UPI", "Swiggy", "PENDING", null, null, "51, Brookefield", "Bengaluru", "Karnataka", "560037", 2),
                new RiderSeed("Mahesh Gowda", "8891447203", "8891447204", 1600, 2000, 2000, "WEDNESDAY", "FRIDAY", "CASH", "Zepto", "REJECTED", "OSTPG4456J", null, "2, Yelahanka New Town", "Bengaluru", "Karnataka", "560064", 1),
                // Handed a bike back; still on the register.
                new RiderSeed("Vinod Naik", "9008773412", "9008773413", 1700, 3000, 3000, "MONDAY", "SATURDAY", "UPI", "Porter", "VERIFIED", "PTUPN7789K", "KA0120170090123", "66, Thubarahalli", "Bengaluru", "Karnataka", "560066", 200),
                new RiderSeed("Suresh Pillai", "8123409965", "8123409966", 1750, 3000, 3000, "WEDNESDAY", "SUNDAY", "UPI", "Dunzo", "VERIFIED", "QUVPP2234L", "KL0720180012345", "30, Kasavanahalli", "Bengaluru", "Karnataka", "560035", 190),
                new RiderSeed("Ramesh Dubey", "7899220148", "7899220149", 1600, 3000, 3000, "MONDAY", "MONDAY", "CASH", "EatSure", "REJECTED", null, null, "11, KR Puram", "Bengaluru", "Karnataka", "560036", 150),
                // A rider who swapped bikes once, and one onboarded today.
                new RiderSeed("Harish Babu", "9886001122", "9886001123", 1850, 3000, 3000, "WEDNESDAY", "THURSDAY", "UPI", "Swiggy Instamart", "VERIFIED", "RVWPB5567M", "KA0420210023456", "25, Haralur", "Bengaluru", "Karnataka", "560102", 90),
                new RiderSeed("Nithin S", "9480011223", "9480011224", 1750, 3000, 3000, "MONDAY", "WEDNESDAY", "UPI", "Zomato", "PENDING", "SWXPS8890N", null, "4, Electronic City Phase 1", "Bengaluru", "Karnataka", "560100", 0));
        }

        private void riders() {
            for (RiderSeed s : riderSeeds()) {
                UUID id = UUID.randomUUID();
                String code = riderCodes.next(tenantId);
                LocalDate onboardedOn = today.minusDays(s.onboardedDaysAgo());
                jdbc.update("""
                        INSERT INTO riders (
                            id, tenant_id, rider_code, name, phone, status, kyc_status,
                            plan_amount_paise, deposit_held_paise, deposit_paid_paise,
                            billing_day, payment_day, payment_mode, platform, onboarded_on,
                            aadhaar_verified, primary_verified, whatsapp_verified, alternate1_verified,
                            aadhaar_encrypted, permanent_address, whatsapp_number, alternate_number_1,
                            local_address, city, state_name, pin_code, pan_number, driving_licence,
                            platform_rider_id, created_on, updated_on)
                        VALUES (?,?,?,?,?,'INACTIVE',?,?,?,?,?,?,?,?,?,true,true,true,true,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        id, tenantId, code, s.name(), s.phone(), s.kyc(),
                        s.planRupees() * 100, s.depositPaidRupees() * 100, s.depositPaidRupees() * 100,
                        s.billingDay(), s.paymentDay(), s.mode(), s.platform(), onboardedOn,
                        aadhaarCipher.encrypt(s.phone().substring(2) + "0" + s.phone().substring(0, 3)),
                        s.localAddress() + ", " + s.city(), s.phone(), s.alt(),
                        s.localAddress(), s.city(), s.state(), s.pin(), s.pan(), s.dl(),
                        s.platform().substring(0, 2).toUpperCase() + s.phone().substring(5),
                        at(onboardedOn, 10), at(onboardedOn, 10));
                riders.add(new RiderRow(id, code, s, null, null, null));
            }
        }

        // -- bikes with riders ------------------------------------------------

        private void assignments() {
            List<String> deployed = vehicles.keySet().stream()
                    .filter(r -> "DEPLOYED".equals(vehicleState.get(r))).toList();
            int next = 0;
            // The first sixteen riders hold bikes.
            for (int i = 0; i < 16; i++) {
                RiderRow r = riders.get(i);
                String registryId = deployed.get(next++);
                LocalDate startedOn = today.minusDays(Math.min(r.seed().onboardedDaysAgo(), 150) - (i % 3));
                if (startedOn.isAfter(today)) {
                    startedOn = today;
                }
                openAssignment(r, registryId, startedOn);
                riders.set(i, new RiderRow(r.id(), r.code(), r.seed(), vehicles.get(registryId), registryId, startedOn));
            }
            // Harish swapped once: his first bike came back with a broken mirror.
            RiderRow harish = riders.get(22);
            String harishFirst = deployed.get(next++);
            closedAssignment(harish, harishFirst, today.minusDays(85), today.minusDays(40), "BREAKDOWN", "MINOR",
                    "UNDER_REPAIR", "Mirror: cracked; Brake lever: bent", "Dhananjay", null, null, null);
            String harishNow = deployed.get(next++);
            openAssignment(harish, harishNow, today.minusDays(40));
            riders.set(22, new RiderRow(harish.id(), harish.code(), harish.seed(), vehicles.get(harishNow), harishNow, today.minusDays(40)));
            // Nithin, onboarded today, took a bike today.
            RiderRow nithin = riders.get(23);
            String nithinBike = deployed.get(next++);
            openAssignment(nithin, nithinBike, today);
            riders.set(23, new RiderRow(nithin.id(), nithin.code(), nithin.seed(), vehicles.get(nithinBike), nithinBike, today));

            // The three who handed a bike back. Their bikes are ones the CSV
            // already has in the workshop or the yard, so the states agree.
            List<String> yard = vehicles.keySet().stream()
                    .filter(r -> "READY_TO_DEPLOY".equals(vehicleState.get(r))).toList();
            List<String> bench = vehicles.keySet().stream()
                    .filter(r -> "UNDER_REPAIR".equals(vehicleState.get(r))).toList();
            // Vinod: returned clean 12 days ago, settlement approved, refund paid out.
            closedAssignment(riders.get(19), yard.get(0), today.minusDays(170), today.minusDays(12), "WENT_HOME", "NONE",
                    "QC_PENDING", "No damage reported", "Meenakshi Iyer", 0L, 300000L, "Meenakshi Iyer");
            // Suresh: returned 5 days ago owing a week, deposit refund waiting for approval.
            closedAssignment(riders.get(20), bench.get(0), today.minusDays(160), today.minusDays(5), "SERVICE_ISSUE", "MINOR",
                    "UNDER_REPAIR", "Rear panel: scratched; Indicator: broken", "Dhananjay", 175000L, 125000L, null);
            // Ramesh: recovered by the team 20 days ago after non-payment; two bikes over his time.
            closedAssignment(riders.get(21), yard.get(1), today.minusDays(140), today.minusDays(70), "RIDER_REQUEST", "NONE",
                    "QC_PENDING", "No damage reported", "Rohan Verma", null, null, null);
            closedAssignment(riders.get(21), bench.get(1), today.minusDays(70), today.minusDays(20), "RECOVERED_BY_TEAM", "MAJOR",
                    "UNDER_REPAIR", "Battery casing: cracked; Seat: torn", "Meenakshi Iyer", 320000L, 0L, "Meenakshi Iyer");
            // Riders with a bike are ACTIVE; the column follows the fact.
            jdbc.update("""
                    UPDATE riders r SET status = 'ACTIVE'
                    WHERE r.tenant_id = ? AND EXISTS (SELECT 1 FROM assignments a WHERE a.rider_id = r.id AND a.ended_on IS NULL)
                    """, tenantId);
        }

        private void openAssignment(RiderRow r, String registryId, LocalDate startedOn) {
            jdbc.update("""
                    INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on, created_on)
                    VALUES (?,?,?,?,?)
                    """, tenantId, r.id(), vehicles.get(registryId), startedOn, at(startedOn, 9));
            lifecycle(vehicles.get(registryId), "READY_TO_DEPLOY", "DEPLOYED", "Assigned to " + r.seed().name(),
                    "Meenakshi Iyer", at(startedOn, 9));
        }

        private void closedAssignment(RiderRow r, String registryId, LocalDate startedOn, LocalDate endedOn, String reason,
                                      String condition, String nextState, String damageNotes, String closedBy,
                                      Long outstandingRent, Long depositRefund, String approvedBy) {
            jdbc.update("""
                    INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on, ended_on, reason, return_condition,
                        next_vehicle_state, damage_notes, outstanding_rent_paise, deposit_refund_paise, closed_by,
                        settlement_approved_by, settlement_approved_on, created_on)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, tenantId, r.id(), vehicles.get(registryId), startedOn, endedOn, reason, condition, nextState,
                    damageNotes, outstandingRent, depositRefund, closedBy,
                    approvedBy, approvedBy == null ? null : at(endedOn.plusDays(1), 12), at(startedOn, 9));
            lifecycle(vehicles.get(registryId), "READY_TO_DEPLOY", "DEPLOYED", "Assigned to " + r.seed().name(),
                    "Meenakshi Iyer", at(startedOn, 9));
            lifecycle(vehicles.get(registryId), "DEPLOYED", "RETURNED", "Returned by " + r.seed().name() + " — " + reason.toLowerCase().replace('_', ' '),
                    closedBy, at(endedOn, 17));
            if (approvedBy != null && depositRefund != null && depositRefund > 0) {
                jdbc.update("UPDATE riders SET deposit_held_paise = greatest(0, deposit_held_paise - ?) WHERE id = ?", depositRefund, r.id());
            }
        }

        // -- workshop --------------------------------------------------------

        private UUID riderIdOf(int index) {
            return riders.get(index).id();
        }

        /** A job on every bike the CSV puts in the workshop, in every queue; six closed ones behind the charges. */
        private void serviceJobs() {
            List<String> underRepair = new ArrayList<>(vehicles.keySet().stream()
                    .filter(r -> "UNDER_REPAIR".equals(vehicleState.get(r))).toList());
            List<String> qcPending = vehicles.keySet().stream()
                    .filter(r -> "QC_PENDING".equals(vehicleState.get(r))).toList();
            List<String> accident = vehicles.keySet().stream()
                    .filter(r -> "ACCIDENT".equals(vehicleState.get(r))).toList();

            // Closed history first, oldest, so the codes read in time order.
            for (int i = 0; i < 6; i++) {
                RiderRow r = riders.get(i);
                int daysAgo = 45 - i * 6;
                UUID job = job(r.bikeRegistryId(), r.id(), i % 2 == 0 ? "WALK_IN" : "RSA", "MINOR", "READY_TO_DEPLOY", "CLOSED",
                        i < 2 ? "RIDER" : i < 4 ? "RIDER" : i == 4 ? "COMPANY" : "DEPOSIT",
                        "Brake pads worn out, replaced both sets; chain tensioned",
                        i % 2 == 0 ? "Rider walked in: brakes squealing" : "Rider called from Marathahalli: brakes gone soft",
                        i % 2 == 0 ? r.seed().city() : "Marathahalli bridge", null, "Raju", 65000 + i * 5000,
                        today.minusDays(daysAgo), today.minusDays(daysAgo - 2));
                item(job, "Brake pads (front and rear)", 45000 + i * 5000, "PART");
                item(job, "Labour", 20000, "LABOUR");
                event(job, i % 2 == 0 ? "MINOR_REPAIR" : "ASSESSMENT", "UNDER_REPAIR", "Dhananjay",
                        "Minor damage → Minor repair. Brakes squealing", at(today.minusDays(daysAgo), 10));
                event(job, "QC_PENDING", "QC_PENDING", "Raju", "Pads replaced, ready for checking", at(today.minusDays(daysAgo - 1), 16));
                inspection(job, r.bikeId(), true, "Abhinandan", null, at(today.minusDays(daysAgo - 2), 10));
                event(job, "READY_TO_DEPLOY", "DEPLOYED", "Abhinandan", "QC passed — all nine checks clear", at(today.minusDays(daysAgo - 2), 10));
                String liability = i < 4 ? "RIDER" : i == 4 ? "COMPANY" : "DEPOSIT";
                event(job, "READY_TO_DEPLOY", "DEPLOYED", "Meenakshi Iyer",
                        "Closed — " + liability.toLowerCase() + " pays " + (650 + i * 50) + " rupees", at(today.minusDays(daysAgo - 2), 11));
                if (!"COMPANY".equals(liability)) {
                    boolean settled = i == 2 || i == 3 || i == 5;
                    LocalDate periodStart = periodStartOnOrAfter(r.seed().billingDay(), today.minusDays(daysAgo - 2));
                    jdbc.update("""
                            INSERT INTO rider_charges (tenant_id, rider_id, service_job_id, vehicle_id, amount_paise, liability,
                                status, charged_on, settled_on, period_start)
                            VALUES (?,?,?,?,?,?,?,?,?,?)
                            """, tenantId, r.id(), job, r.bikeId(), 65000 + i * 5000, liability,
                            settled ? "SETTLED" : "OPEN", at(today.minusDays(daysAgo - 2), 11),
                            settled ? at(today.minusDays(daysAgo - 9), 12) : null, periodStart);
                    if ("DEPOSIT".equals(liability)) {
                        jdbc.update("UPDATE riders SET deposit_held_paise = greatest(0, deposit_held_paise - ?) WHERE id = ?",
                                65000 + i * 5000, r.id());
                    }
                }
            }

            // The bench, one queue each, then the rest in minor repair.
            // The first two are the bikes Suresh and Ramesh handed back (see
            // assignments()); the rest came in on their own.
            String[][] bench = {
                {"ASSESSMENT", "DEBOARD", "MINOR", "Returned by rider; rear panel scratched, indicator broken", "Rear panel: scratched; Indicator: broken", null},
                {"MAJOR_REPAIR", "DEBOARD", "MAJOR", "Recovered by the team; battery casing cracked, seat torn", "Battery casing: cracked; Seat: torn", null},
                {"MINOR_REPAIR", "WALK_IN", "MINOR", "Rear indicator and number plate light out", "Indicator: dead; Plate light: dead", null},
                {"PARTS_WAITING", "WALK_IN", "MINOR", "Left mirror and horn", "Mirror: missing; Horn: dead", "Mirror arm on order from e-Sprinto, due Thursday"},
                {"WARRANTY", "QRT", "MAJOR", "Battery not holding charge after 18 months", "Battery: capacity below 60%", "Sun Mobility claim SM-2026-1187"},
                {"INSURANCE", "RSA", "MAJOR", "Side collision with an auto at Silk Board", "Fairing: cracked; Footrest: bent", "ICICI Lombard claim CL/26/448812"},
                {"MINOR_REPAIR", "WALK_IN", "MINOR", "Puncture, rear", "Tyre: puncture", null},
                {"MINOR_REPAIR", "QRT", "MINOR", "Chain slipping under load", "Chain: stretched", null},
                {"MAJOR_REPAIR", "WALK_IN", "MAJOR", "Front fork leaking oil", "Fork seal: leaking", null},
            };
            for (int i = 0; i < underRepair.size(); i++) {
                String[] b = bench[Math.min(i, bench.length - 1)];
                int daysAgo = 9 - i;
                UUID riderId = i == 0 ? riderIdOf(20) : i == 1 ? riderIdOf(21) : null;
                UUID job = job(underRepair.get(i), riderId, b[1], b[2], b[0], i % 2 == 0 ? "OPEN" : "IN_PROGRESS", null,
                        i % 2 == 0 ? null : "Stripped and diagnosed; parts listed", b[3],
                        "RSA".equals(b[1]) || "QRT".equals(b[1]) ? "Outer Ring Road, near Silk Board" : "Whitefield", b[5],
                        i % 2 == 0 ? null : "Raju", i % 2 == 0 ? 0 : 30000, today.minusDays(daysAgo), null);
                event(job, b[0], "UNDER_REPAIR", "Dhananjay", b[2].charAt(0) + b[2].substring(1).toLowerCase() + " damage → "
                        + b[0].charAt(0) + b[0].substring(1).toLowerCase().replace('_', ' ') + ". " + b[3], at(today.minusDays(daysAgo), 10));
                if (i % 2 == 1) {
                    item(job, "Diagnosis and strip-down", 30000, "LABOUR");
                    event(job, b[0], "UNDER_REPAIR", "Raju", "Stripped and diagnosed; parts listed", at(today.minusDays(daysAgo - 1), 15));
                }
            }

            // Quality check: two first checks on bikes that came back clean, two
            // repairs waiting for QC, one of them failed once already.
            for (int i = 0; i < qcPending.size(); i++) {
                boolean repair = i >= 2;
                int daysAgo = 4 - i;
                UUID job = job(qcPending.get(i), null, repair ? "WALK_IN" : "INSPECTION",
                        repair ? "MINOR" : "NONE", "QC_PENDING", repair ? "IN_PROGRESS" : "OPEN", null,
                        repair ? "Headlight assembly replaced; wiring re-routed" : null,
                        repair ? "Headlight flickering, dies at speed" : "Routine check after return",
                        "Whitefield", null, repair ? "Raju" : null, repair ? 180000 : 0, today.minusDays(daysAgo), null);
                if (repair) {
                    item(job, "Headlight assembly", 150000, "PART");
                    item(job, "Labour", 30000, "LABOUR");
                    event(job, "MINOR_REPAIR", "UNDER_REPAIR", "Dhananjay", "Minor damage → Minor repair. Headlight flickering", at(today.minusDays(daysAgo), 10));
                    if (i == 3) {
                        event(job, "QC_PENDING", "QC_PENDING", "Raju", "Headlight replaced, ready for checking", at(today.minusDays(daysAgo), 14));
                        inspection(job, vehicles.get(qcPending.get(i)), false, "Abhinandan", "Lights pass, but the horn is dead", at(today.minusDays(daysAgo), 15));
                        event(job, "MINOR_REPAIR", "UNDER_REPAIR", "Abhinandan", "QC failed on horn", at(today.minusDays(daysAgo), 15));
                        event(job, "QC_PENDING", "QC_PENDING", "Raju", "Horn replaced, back for checking", at(today.minusDays(daysAgo - 1), 11));
                    } else {
                        event(job, "QC_PENDING", "QC_PENDING", "Raju", "Headlight replaced, ready for checking", at(today.minusDays(daysAgo), 16));
                    }
                } else {
                    event(job, "QC_PENDING", "QC_PENDING", "Rohan Verma", "No damage reported → Quality check. Routine check after return", at(today.minusDays(daysAgo), 10));
                }
            }

            // Accidents: both riders were moved onto other bikes; the jobs keep them as the people concerned.
            for (int i = 0; i < accident.size(); i++) {
                int daysAgo = 15 - i * 4;
                UUID job = job(accident.get(i), riderIdOf(14 + i), "RSA", "ACCIDENT", "ACCIDENT", "IN_PROGRESS", null,
                        "Frame checked, awaiting surveyor", i == 0 ? "Hit from behind at Marathahalli signal; rider unhurt"
                                : "Skidded on wet road at Bellandur; rider treated for grazes",
                        i == 0 ? "Marathahalli signal" : "Bellandur", "FIR 0" + (412 + i) + "/2026, Marathahalli PS", "Raju", 0,
                        today.minusDays(daysAgo), null);
                event(job, "ACCIDENT", "ACCIDENT", "Dhananjay", "Accident damage → Accident. " + (i == 0 ? "Hit from behind" : "Skidded on wet road"), at(today.minusDays(daysAgo), 19));
                event(job, "ACCIDENT", "ACCIDENT", "Abhinandan", "Surveyor booked; frame alignment to be checked", at(today.minusDays(daysAgo - 2), 11));
            }
        }

        private UUID job(String registryId, UUID riderId, String source, String damage, String queue, String status,
                         String liability, String workSummary, String damageNotes, String location, String reference,
                         String technician, long totalPaise, LocalDate createdOn, LocalDate closedOn) {
            UUID id = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO service_jobs (id, tenant_id, job_code, vehicle_id, rider_id, source, damage_category, queue, status,
                        liability, work_summary, damage_notes, location, reference, technician, total_cost_paise,
                        created_on, closed_on, updated_on)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, id, tenantId, jobCodes.next(tenantId), vehicles.get(registryId), riderId, source, damage, queue, status,
                    liability, workSummary == null ? "" : workSummary, damageNotes, location, reference, technician, totalPaise,
                    at(createdOn, 10), closedOn == null ? null : at(closedOn, 11), at(closedOn == null ? createdOn : closedOn, 11));
            jobs++;
            return id;
        }

        private void item(UUID job, String label, long paise, String kind) {
            jdbc.update("INSERT INTO service_job_items (tenant_id, job_id, label, cost_paise, kind) VALUES (?,?,?,?,?)",
                    tenantId, job, label, paise, kind);
        }

        private void event(UUID job, String queue, String state, String actor, String note, OffsetDateTime when) {
            jdbc.update("INSERT INTO service_job_events (tenant_id, job_id, queue, vehicle_state, actor, note, occurred_on) VALUES (?,?,?,?,?,?,?)",
                    tenantId, job, queue, state, actor, note, when);
        }

        private void inspection(UUID job, UUID vehicleId, boolean passed, String inspector, String notes, OffsetDateTime when) {
            String checks = passed
                    ? "{\"brakes\":true,\"tyres\":true,\"battery\":true,\"lights\":true,\"horn\":true,\"mirrors\":true,\"throttle\":true,\"frame\":true,\"roadtest\":true}"
                    : "{\"brakes\":true,\"tyres\":true,\"battery\":true,\"lights\":true,\"horn\":false,\"mirrors\":true,\"throttle\":true,\"frame\":true,\"roadtest\":true}";
            jdbc.update("INSERT INTO qc_inspections (tenant_id, job_id, vehicle_id, checks, passed, inspector, notes, inspected_on) VALUES (?,?,?,?::jsonb,?,?,?,?)",
                    tenantId, job, vehicleId, checks, passed, inspector, notes, when);
        }

        // -- money -----------------------------------------------------------

        /**
         * Eight weeks of billing for every rider who held a bike in that week,
         * current week included. Most weeks are paid in full with a receipt;
         * some riders are a week behind, one is two weeks behind, one paid
         * half, and the current week is pending for everybody.
         */
        private void billing() {
            UUID collector = userId("Meenakshi Iyer");
            for (int i = 0; i < riders.size(); i++) {
                RiderRow r = riders.get(i);
                if (r.bikeId() == null) {
                    continue;
                }
                LocalDate current = periodStartOnOrBefore(r.seed().billingDay(), today);
                for (int back = 7; back >= 0; back--) {
                    LocalDate start = current.minusWeeks(back);
                    LocalDate end = start.plusDays(6);
                    if (end.isBefore(r.assignedOn())) {
                        continue;
                    }
                    long plan = r.seed().planRupees() * 100;
                    int days = (int) Math.min(7, end.toEpochDay() - Math.max(start.toEpochDay(), r.assignedOn().toEpochDay()) + 1);
                    long perDay = Math.round(plan / 7.0);
                    long billed = days == 7 ? plan : perDay * days;
                    Long charges = jdbc.queryForObject("""
                            SELECT coalesce(sum(amount_paise), 0) FROM rider_charges
                            WHERE rider_id = ? AND liability = 'RIDER' AND period_start = ?
                            """, Long.class, r.id(), start);
                    long total = billed + (charges == null ? 0 : charges);
                    // Who pays what, by rider: a pattern, not a dice roll, so a
                    // tester can find each case by name.
                    String status;
                    long paid;
                    if (back == 0) {
                        status = "PENDING";
                        paid = 0;
                    } else if (i == 1 && back == 1) {
                        status = "PARTIAL";
                        paid = total / 2;
                    } else if (i == 4 && back <= 2) {
                        status = "OVERDUE";
                        paid = 0;
                    } else if (i == 9 && back == 1) {
                        status = "OVERDUE";
                        paid = 0;
                    } else {
                        status = "PAID";
                        paid = total;
                    }
                    UUID periodId = UUID.randomUUID();
                    String receipt = paid > 0 ? receiptNo(end.getYear()) : null;
                    jdbc.update("""
                            INSERT INTO payment_periods (id, tenant_id, rider_id, period_start, period_end, billing_day, vehicle_id,
                                plan_amount_paise, days_billed, per_day_amount_paise, billed_amount_paise, service_charges_paise,
                                arrears_paise, total_due_paise, amount_paid_paise, status, receipt_no, generated_on, updated_on)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)
                            """, periodId, tenantId, r.id(), start, end, r.seed().billingDay(), r.bikeId(),
                            plan, days, perDay, billed, charges == null ? 0 : charges, total, paid, status, receipt,
                            at(start, 6), at(paid > 0 ? end : start, 12));
                    periods++;
                    if (paid > 0) {
                        String reference = switch (r.seed().mode()) {
                            case "UPI" -> "UPI" + Math.abs((r.code() + start).hashCode() % 900000000 + 100000000);
                            case "BANK_TRANSFER" -> "NEFT" + Math.abs((r.code() + start).hashCode() % 9000000 + 1000000);
                            default -> null;
                        };
                        jdbc.update("""
                                INSERT INTO payment_collections (tenant_id, period_id, amount_paise, method, reference, collected_on, collected_by_user_id)
                                VALUES (?,?,?,?,?,?,?)
                                """, tenantId, periodId, paid, r.seed().mode(), reference, at(end.minusDays(back % 2), 19), collector);
                        collections++;
                    }
                }
            }
        }

        private String receiptNo(int year) {
            jdbc.update("INSERT INTO receipt_counters (tenant_id, year) VALUES (?, ?) ON CONFLICT (tenant_id, year) DO NOTHING", tenantId, year);
            Long issued = jdbc.queryForObject("UPDATE receipt_counters SET next_no = next_no + 1 WHERE tenant_id = ? AND year = ? RETURNING next_no - 1",
                    Long.class, tenantId, year);
            return "RCPT-%d-%06d".formatted(year, issued == null ? 0L : issued);
        }

        private LocalDate periodStartOnOrBefore(String billingDay, LocalDate date) {
            return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.valueOf(billingDay)));
        }

        private LocalDate periodStartOnOrAfter(String billingDay, LocalDate date) {
            return date.with(TemporalAdjusters.nextOrSame(DayOfWeek.valueOf(billingDay)));
        }

        // -- the trail -------------------------------------------------------

        private void auditTrail() {
            jdbc.update("INSERT INTO rider_plan_changes (tenant_id, rider_id, from_paise, to_paise, actor_name, occurred_on) VALUES (?,?,?,?,?,?)",
                    tenantId, riderIdOf(0), 160000, 175000, "Meenakshi Iyer", at(today.minusDays(60), 11));
            jdbc.update("INSERT INTO rider_plan_changes (tenant_id, rider_id, from_paise, to_paise, actor_name, occurred_on) VALUES (?,?,?,?,?,?)",
                    tenantId, riderIdOf(3), 199900, 209900, "Meenakshi Iyer", at(today.minusDays(33), 11));
            jdbc.update("INSERT INTO rider_plan_changes (tenant_id, rider_id, from_paise, to_paise, actor_name, occurred_on) VALUES (?,?,?,?,?,?)",
                    tenantId, riderIdOf(8), 189900, 199900, "Priya Menon", at(today.minusDays(14), 16));
            UUID rohan = userId("Rohan Verma");
            if (rohan != null) {
                jdbc.update("INSERT INTO user_role_changes (tenant_id, user_id, from_role, to_role, actor_name, occurred_on) VALUES (?,?,?,?,?,?)",
                        tenantId, rohan, "SERVICE_MANAGER", "FLEET_STAFF", "Meenakshi Iyer", at(today.minusDays(25), 10));
            }
        }

        // -- shared ----------------------------------------------------------

        private void lifecycle(UUID vehicleId, String from, String to, String note, String actor, OffsetDateTime when) {
            jdbc.update("""
                    INSERT INTO vehicle_lifecycle_events (tenant_id, vehicle_id, from_state, to_state, note, actor_user_id, actor_name, occurred_on)
                    VALUES (?,?,?,?,?,NULL,?,?)
                    """, tenantId, vehicleId, from, to, note, actor, when);
        }

        private OffsetDateTime at(LocalDate date, int hour) {
            return date.atTime(LocalTime.of(hour, 0)).atZone(ZONE).toOffsetDateTime();
        }
    }

    // -----------------------------------------------------------------------
    // The CSV
    // -----------------------------------------------------------------------

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
}
