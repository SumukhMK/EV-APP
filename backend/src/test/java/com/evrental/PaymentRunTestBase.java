package com.evrental;

import com.evrental.common.AadhaarCipher;
import com.evrental.payment.BillingClock;
import com.evrental.payment.BillingPeriod;
import com.evrental.rider.BillingDay;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.UUID;
import java.util.function.Function;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * The fixture the payment-run tests need: two tenants, riders on both billing
 * cycles, and enough of a workshop to hang a charge off.
 *
 * <p>Its own tenant ids (3000…/4000…), deliberately not the ranges
 * RiderTestBase (1000…/2000…) or ServiceJobTestBase (e0…/f0…) use. A shared id
 * would mean one suite's cleanup deciding another's fixture, which is the
 * coupling both of those bases already warn about.
 *
 * <p>The riders are chosen to cover the arithmetic that is easy to get wrong:
 * one on ₹1,999 (the plan where {@code round(plan/7) × 7} does not come back
 * to the plan), one on no plan at all, one carrying service charges and
 * arrears, and one on the other cycle so a Monday run can be shown not to
 * include them.
 */
@AutoConfigureMockMvc
public abstract class PaymentRunTestBase extends PostgresTestBase {

    protected static final UUID TENANT = UUID.fromString("70000000-0000-0000-0000-000000000007");
    protected static final UUID OTHER_TENANT = UUID.fromString("80000000-0000-0000-0000-000000000008");
    /** V001 seeds the platform's own tenant with this fixed id. */
    protected static final UUID PLATFORM_TENANT = UUID.fromString("00000000-0000-0000-0000-000000000001");

    protected static final String PASSWORD = "test-password-123";
    protected static final String ADMIN_EMAIL = "pay-admin@g1mobility.in";
    protected static final String STAFF_EMAIL = "pay-staff@g1mobility.in";
    protected static final String MANAGER_EMAIL = "pay-service@g1mobility.in";
    protected static final String OTHER_ADMIN_EMAIL = "pay-other-admin@g1mobility.in";
    protected static final String SUPER_ADMIN_EMAIL = "pay-super@g1mobility.in";

    /** ₹1,999 a week — round(199900 / 7) × 7 is ₹1,999.05, not ₹1,999. */
    protected static final long ROUNDING_PLAN_PAISE = 199_900L;
    protected static final long PLAIN_PLAN_PAISE = 175_000L;
    protected static final long WEDNESDAY_PLAN_PAISE = 190_000L;

    protected static final UUID MONDAY_RIDER = UUID.fromString("70000000-0000-0000-0000-0000000000a1");
    protected static final UUID CHARGED_RIDER = UUID.fromString("70000000-0000-0000-0000-0000000000a2");
    protected static final UUID NO_PLAN_RIDER = UUID.fromString("70000000-0000-0000-0000-0000000000a3");
    protected static final UUID WEDNESDAY_RIDER = UUID.fromString("70000000-0000-0000-0000-0000000000a4");
    /** On OTHER_TENANT's register — invisible to TENANT's callers. */
    protected static final UUID RIVAL_RIDER = UUID.fromString("80000000-0000-0000-0000-0000000000b1");

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected DataSource dataSource;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected AadhaarCipher aadhaarCipher;

    @Autowired
    protected BillingClock billingClock;

    protected UUID vehicleId;

    @BeforeEach
    void seedTenantsUsersAndRiders() {
        superAdmin(jdbc -> {
            // Children before parents, all the way down. payment_collections
            // references payment_periods, which references riders; rider_charges
            // references service_jobs, which references vehicles and riders.
            jdbc.update("DELETE FROM payment_collections WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM payment_periods WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM receipt_counters WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM rider_charges WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM qc_inspections WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM service_job_items WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM service_job_events WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM service_jobs WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM riders WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicle_lifecycle_events WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM vehicles WHERE tenant_id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM users WHERE email IN (?, ?, ?, ?, ?)",
                    ADMIN_EMAIL, STAFF_EMAIL, MANAGER_EMAIL, OTHER_ADMIN_EMAIL, SUPER_ADMIN_EMAIL);
            jdbc.update("DELETE FROM tenants WHERE id IN (?, ?)", TENANT, OTHER_TENANT);

            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Payments Co', 'payments-co', 'ACTIVE')", TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Rival Payments Co', 'rival-payments-co', 'ACTIVE')", OTHER_TENANT);

            insertUser(jdbc, TENANT, "Meenakshi Iyer", ADMIN_EMAIL, "FLEET_ADMIN");
            insertUser(jdbc, TENANT, "Dhananjay", STAFF_EMAIL, "FLEET_STAFF");
            insertUser(jdbc, TENANT, "Abhinandan", MANAGER_EMAIL, "SERVICE_MANAGER");
            insertUser(jdbc, OTHER_TENANT, "Rival Admin", OTHER_ADMIN_EMAIL, "FLEET_ADMIN");
            insertUser(jdbc, PLATFORM_TENANT, "Priya Menon", SUPER_ADMIN_EMAIL, "SUPER_ADMIN");

            // Named so the run's by-name ordering is predictable.
            insertRider(jdbc, MONDAY_RIDER, TENANT, "Anil Shetty", "9845010001",
                    ROUNDING_PLAN_PAISE, BillingDay.MONDAY);
            insertRider(jdbc, CHARGED_RIDER, TENANT, "Bhavana Rao", "9845010002",
                    PLAIN_PLAN_PAISE, BillingDay.MONDAY);
            insertRider(jdbc, NO_PLAN_RIDER, TENANT, "Chetan Naik", "9845010003",
                    0L, BillingDay.MONDAY);
            insertRider(jdbc, WEDNESDAY_RIDER, TENANT, "Deepa Hegde", "9845010004",
                    WEDNESDAY_PLAN_PAISE, BillingDay.WEDNESDAY);
            insertRider(jdbc, RIVAL_RIDER, OTHER_TENANT, "Rival Rider", "9000000002",
                    PLAIN_PLAN_PAISE, BillingDay.MONDAY);
            return null;
        });
        vehicleId = insertVehicle(TENANT, "BLRSS0428", "CHASSIS0428");
    }

    private void insertUser(JdbcTemplate jdbc, UUID tenantId, String name, String email, String role) {
        jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                tenantId, name, email, passwordEncoder.encode(PASSWORD), role);
    }

    private void insertRider(JdbcTemplate jdbc, UUID id, UUID tenantId, String name, String phone,
                             long planPaise, BillingDay billingDay) {
        jdbc.update("INSERT INTO riders (id, tenant_id, name, phone, status, kyc_status, "
                        + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, payment_mode, "
                        + "platform, onboarded_on, aadhaar_encrypted) "
                        + "VALUES (?, ?, ?, ?, 'ACTIVE', 'VERIFIED', ?, 300000, ?, 'MONDAY', 'UPI', "
                        + "'Zomato', CURRENT_DATE - 60, ?)",
                id, tenantId, name, phone, planPaise, billingDay.name(),
                aadhaarCipher.encrypt("9999" + phone.substring(4) + "77"));
    }

    protected UUID insertVehicle(UUID tenantId, String registryId, String chassis) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "INSERT INTO vehicles (tenant_id, registry_id, chassis_number, make, model, "
                        + "battery_type, battery_vendor, hub, state, inducted_on) "
                        + "VALUES (?, ?, ?, 'e-Sprinto', 'Eagle 2', 'Yuma', 'Yuma', 'Koramangala', "
                        + "'DEPLOYED', CURRENT_DATE) RETURNING id",
                UUID.class, tenantId, registryId, chassis));
    }

    /**
     * A charge on the ledger, written straight in.
     *
     * <p>The async path that normally raises one is RiderChargeTest's subject;
     * here the charge is a given, and going through a full open/price/QC/close
     * round trip for each of them would test S4 again rather than the run.
     * A closed job is still inserted because rider_charges has a real foreign
     * key to one.
     */
    protected UUID insertCharge(UUID tenantId, UUID riderId, long amountPaise, String liability,
                                String status, LocalDate periodStart) {
        return superAdmin(jdbc -> {
            UUID jobId = jdbc.queryForObject(
                    "INSERT INTO service_jobs (tenant_id, vehicle_id, rider_id, source, damage_category, "
                            + "queue, status, liability, total_cost_paise, closed_on) "
                            + "VALUES (?, ?, ?, 'DEBOARD', 'MINOR', 'READY_TO_DEPLOY', 'CLOSED', ?, ?, now()) "
                            + "RETURNING id",
                    UUID.class, tenantId, vehicleId, riderId, liability, amountPaise);
            return jdbc.queryForObject(
                    "INSERT INTO rider_charges (tenant_id, rider_id, service_job_id, vehicle_id, "
                            + "amount_paise, liability, status, period_start, settled_on) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                    UUID.class, tenantId, riderId, jobId, vehicleId, amountPaise, liability, status,
                    periodStart, "SETTLED".equals(status) ? java.sql.Timestamp.from(java.time.Instant.now()) : null);
        });
    }

    /**
     * A frozen period row, written straight in.
     *
     * <p>Used for weeks in the past. Generation only ever writes the
     * <em>current</em> week — that is the whole of the no-scheduler trade —
     * so a test about an overdue rider or a history panel has to put the
     * earlier weeks there itself.
     */
    protected UUID insertPeriod(UUID tenantId, UUID riderId, LocalDate periodStart,
                                BillingDay billingDay, long totalDuePaise, long amountPaidPaise,
                                String status) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "INSERT INTO payment_periods (tenant_id, rider_id, period_start, period_end, "
                        + "billing_day, plan_amount_paise, days_billed, per_day_amount_paise, "
                        + "billed_amount_paise, service_charges_paise, arrears_paise, total_due_paise, "
                        + "amount_paid_paise, status) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 7, ?, ?, 0, 0, ?, ?, ?) RETURNING id",
                UUID.class, tenantId, riderId, periodStart, periodStart.plusDays(6), billingDay.name(),
                totalDuePaise, Math.round(totalDuePaise / 7.0), totalDuePaise, totalDuePaise,
                amountPaidPaise, status));
    }

    /** The Monday or Wednesday this week's run is for, in the billing zone. */
    protected LocalDate currentPeriodStart(BillingDay billingDay) {
        return BillingPeriod.startOnOrBefore(billingDay, billingClock.today());
    }

    protected LocalDate today() {
        return billingClock.today();
    }

    /** A bearer token for the given account, through the real login endpoint. */
    protected String tokenFor(String email) throws Exception {
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return new ObjectMapper().readTree(body).get("accessToken").asString();
    }

    /** Arranges and inspects rows across tenants, which RLS otherwise hides. */
    protected <T> T superAdmin(Function<JdbcTemplate, T> work) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement("SELECT set_config('app.tenant_id', '*', true)")) {
                ps.execute();
            }
            T result = work.apply(new JdbcTemplate(new SingleConnectionDataSource(conn, true)));
            conn.commit();
            return result;
        } catch (SQLException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }
}
