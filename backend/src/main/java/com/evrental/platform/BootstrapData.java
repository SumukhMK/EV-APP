package com.evrental.platform;

import com.evrental.user.User;
import com.evrental.user.UserRepository;
import com.evrental.user.UserRole;
import com.evrental.user.UserStatus;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * The first admin, created at boot — the "a first admin user to log in as"
 * item from WORK_SPLIT.md.
 *
 * <p>Deliberately not a Flyway migration: a committed password hash is a
 * committed credential. Instead the runner reads the account from the
 * environment (local defaults in application-local.yml) and creates it only if
 * missing, so it is idempotent and a deployed environment can provision its
 * first admin the same way. When {@code app.bootstrap.admin-email} is empty the
 * runner does nothing — an environment that already has admins leaves it unset.
 *
 * <p>The local profile also seeds the four demo personas the frontend's persona
 * switch uses (session.tsx), so each role can actually be logged into. The
 * super admin is the platform admin above; the other three belong to a demo
 * tenant, G1 Mobility.
 *
 * <p>All of it runs under the super-admin sentinel: creating tenants and users
 * is a cross-tenant write, and RLS would refuse it otherwise.
 */
@Component
public class BootstrapData implements ApplicationRunner {

    /** V001 seeds the platform's own tenant with this fixed id. */
    static final UUID PLATFORM_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private static final Logger log = LoggerFactory.getLogger(BootstrapData.class);

    private final TenantRepository tenants;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    private final String adminEmail;
    private final String adminPassword;
    private final String adminName;
    private final String demoPassword;

    public BootstrapData(
            TenantRepository tenants,
            UserRepository users,
            PasswordEncoder passwordEncoder,
            JdbcTemplate jdbc,
            PlatformTransactionManager txManager,
            @Value("${app.bootstrap.admin-email:}") String adminEmail,
            @Value("${app.bootstrap.admin-password:}") String adminPassword,
            @Value("${app.bootstrap.admin-name:}") String adminName,
            @Value("${app.bootstrap.demo-password:}") String demoPassword) {
        this.tenants = tenants;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminName = adminName;
        this.demoPassword = demoPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        tx.executeWithoutResult(status -> {
            // set_config returns the new value, so this is a query, not an update.
            jdbc.queryForObject("SELECT set_config('app.tenant_id', '*', true)", String.class);
            if (StringUtils.hasText(adminEmail) && StringUtils.hasText(adminPassword)) {
                ensureAdmin();
            }
            if (StringUtils.hasText(demoPassword)) {
                ensureDemoTenant();
            }
        });
    }

    private void ensureAdmin() {
        if (users.findByEmailIgnoreCase(adminEmail.trim()).isPresent()) {
            return;
        }
        User admin = new User();
        admin.setTenantId(PLATFORM_TENANT_ID);
        admin.setName(StringUtils.hasText(adminName) ? adminName.trim() : "Platform Admin");
        admin.setEmail(adminEmail.trim());
        admin.setPasswordHash(passwordEncoder.encode(adminPassword));
        admin.setRole(UserRole.SUPER_ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        users.save(admin);
        log.info("Bootstrap: created platform admin {}", admin.getEmail());
    }

    private void ensureDemoTenant() {
        Tenant g1 = tenants.findBySlugIgnoreCase("g1-mobility").orElseGet(() -> {
            Tenant tenant = new Tenant();
            tenant.setName("G1 Mobility");
            tenant.setSlug("g1-mobility");
            tenant.setStatus("ACTIVE");
            Tenant saved = tenants.save(tenant);
            log.info("Bootstrap: created demo tenant {}", saved.getSlug());
            return saved;
        });
        ensureDemoUser(g1.getId(), "Meenakshi Iyer", "meenakshi@g1mobility.in", UserRole.TENANT_ADMIN);
        ensureDemoUser(g1.getId(), "Abhinandan", "abhinandan@g1mobility.in", UserRole.SERVICE_MANAGER);
        ensureDemoUser(g1.getId(), "Dhananjay", "dhananjay@g1mobility.in", UserRole.FLEET_STAFF);
    }

    private void ensureDemoUser(UUID tenantId, String name, String email, UserRole role) {
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            return;
        }
        User user = new User();
        user.setTenantId(tenantId);
        user.setName(name);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(demoPassword));
        user.setRole(role);
        user.setStatus(UserStatus.ACTIVE);
        users.save(user);
        log.info("Bootstrap: created demo user {}", user.getEmail());
    }
}