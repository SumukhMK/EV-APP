package com.evrental;

import com.evrental.common.AadhaarCipher;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
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
 * The fixture every rider test needs: two tenants plus the platform tenant,
 * each with the accounts the tests act on, and a rider on each tenant's
 * register so read tests have something to read.
 *
 * <p>Own tenant ids (1000…/2000…), deliberately not the a/b/c/d/e/f ranges the
 * other bases use — a shared id would mean one test's cleanup deciding another
 * fixture's rows, the coupling ServiceJobTestBase's javadoc warns about.
 */
@AutoConfigureMockMvc
public abstract class RiderTestBase extends PostgresTestBase {

    protected static final UUID TENANT = UUID.fromString("10000000-0000-0000-0000-000000000001");
    protected static final UUID OTHER_TENANT = UUID.fromString("20000000-0000-0000-0000-000000000002");
    /** V001 seeds the platform's own tenant with this fixed id. */
    protected static final UUID PLATFORM_TENANT = UUID.fromString("00000000-0000-0000-0000-000000000001");

    protected static final String PASSWORD = "test-password-123";
    protected static final String ADMIN_EMAIL = "riders-admin@g1mobility.in";
    protected static final String STAFF_EMAIL = "riders-staff@g1mobility.in";
    protected static final String SERVICE_MANAGER_EMAIL = "riders-service@g1mobility.in";
    protected static final String OTHER_FLEET_ADMIN_EMAIL = "riders-other-admin@g1mobility.in";
    protected static final String SUPER_ADMIN_EMAIL = "riders-super@g1mobility.in";

    /** A rider on TENANT's register, for read tests. */
    protected static final UUID RIDER_A = UUID.fromString("10000000-0000-0000-0000-0000000000a1");
    /** A rider on OTHER_TENANT's register — invisible to TENANT's callers. */
    protected static final UUID RIDER_B = UUID.fromString("20000000-0000-0000-0000-0000000000b1");

    /** A valid onboard body. Tests that want a failure change one field. */
    protected static final String ONBOARD_BODY = """
            {"aadhaarNumber":"123456789012","name":"Ravi Kumar",
             "permanentAddress":"12 MG Road, Bengaluru",
             "phone":"9876543210","whatsappNumber":"9876543210","alternateNumber1":"9876543211",
             "localAddress":"34 Residency Road, Bengaluru","city":"Bengaluru","state":"Karnataka",
             "pinCode":"560001","locationCoordinates":null,"panNumber":null,"drivingLicence":null,
             "workingPlatform":"Zomato","platformRiderId":null,
             "planAmount":175000,"billingDay":"MONDAY","paymentDay":"MONDAY","paymentMode":"UPI",
             "depositPlan":300000,"depositPaid":300000,"onboardedOn":"2026-09-26",
             "verification":{"aadhaarVerified":true,"primaryVerified":true,
                             "whatsappVerified":true,"alternate1Verified":true},
             "vehicleId":null}""";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected DataSource dataSource;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected AadhaarCipher aadhaarCipher;

    @BeforeEach
    void seedTenantsUsersAndRiders() {
        superAdmin(jdbc -> {
            // Riders reference tenants; users reference tenants; refresh_tokens
            // reference users. The platform tenant row itself is V001's, shared
            // by the whole suite — never deleted, only its users.
            jdbc.update("DELETE FROM riders WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM refresh_tokens WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM users WHERE tenant_id IN (?, ?, ?)",
                    TENANT, OTHER_TENANT, PLATFORM_TENANT);
            jdbc.update("DELETE FROM tenants WHERE id IN (?, ?)", TENANT, OTHER_TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Riders Co', 'riders-co', 'ACTIVE')", TENANT);
            jdbc.update("INSERT INTO tenants (id, name, slug, status) "
                    + "VALUES (?, 'Rival Riders Co', 'rival-riders-co', 'ACTIVE')", OTHER_TENANT);
            insertUser(jdbc, TENANT, "Meenakshi Iyer", ADMIN_EMAIL, "FLEET_ADMIN", PASSWORD);
            insertUser(jdbc, TENANT, "Dhananjay", STAFF_EMAIL, "FLEET_STAFF", PASSWORD);
            insertUser(jdbc, TENANT, "Abhinandan", SERVICE_MANAGER_EMAIL, "SERVICE_MANAGER", PASSWORD);
            insertUser(jdbc, OTHER_TENANT, "Rival Admin", OTHER_FLEET_ADMIN_EMAIL, "FLEET_ADMIN", PASSWORD);
            insertUser(jdbc, PLATFORM_TENANT, "Priya Menon", SUPER_ADMIN_EMAIL, "SUPER_ADMIN", PASSWORD);
            insertRider(jdbc, RIDER_A, TENANT, "Anil Shetty", "9845012277",
                    "ACTIVE", "VERIFIED", 175000, 300000, "MONDAY", "MONDAY", "UPI", "Zomato",
                    "111122223333");
            insertRider(jdbc, RIDER_B, OTHER_TENANT, "Rival Rider", "9000000002",
                    "ACTIVE", "VERIFIED", 175000, 300000, "MONDAY", "MONDAY", "UPI", "Zomato",
                    "444455556666");
            return null;
        });
    }

    private void insertUser(JdbcTemplate jdbc, UUID tenantId, String name, String email,
                            String role, String password) {
        jdbc.update("INSERT INTO users (tenant_id, name, email, password_hash, role, status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                tenantId, name, email, passwordEncoder.encode(password), role);
    }

    protected void insertRider(JdbcTemplate jdbc, UUID id, UUID tenantId, String name, String phone,
                               String status, String kycStatus, long planPaise, long depositPaise,
                               String billingDay, String paymentDay, String paymentMode, String platform,
                               String aadhaar) {
        jdbc.update("INSERT INTO riders (id, tenant_id, name, phone, status, kyc_status, "
                        + "plan_amount_paise, deposit_held_paise, billing_day, payment_day, payment_mode, "
                        + "platform, onboarded_on, aadhaar_encrypted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?)",
                id, tenantId, name, phone, status, kycStatus, planPaise, depositPaise,
                billingDay, paymentDay, paymentMode, platform, aadhaarCipher.encrypt(aadhaar));
    }

    /** A bearer token for the given account, obtained through the real login endpoint. */
    protected String tokenFor(String email) throws Exception {
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/auth/login")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return new ObjectMapper().readTree(body).get("accessToken").asString();
    }

    /** Arranges and inspects rows across tenants, which RLS otherwise hides from the test. */
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