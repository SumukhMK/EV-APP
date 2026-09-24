package com.evrental;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * A real Postgres 16, not H2.
 *
 * <p>The schema leans on row-level security, partial unique indexes and
 * {@code TIMESTAMPTZ}; H2 has none of them, so a green test on H2 would be
 * evidence about a database this application never runs on.
 *
 * <p>The container is static, so one instance serves the whole suite, and the
 * connection is made as {@code evrental} — the NOSUPERUSER role the init script
 * creates — because a superuser ignores every policy in V001. Connecting as the
 * container's own bootstrap user would make the isolation tests pass for the
 * wrong reason.
 */
@SpringBootTest
@Testcontainers
public abstract class PostgresTestBase {

    // The container is never closed in a finally block: it is deliberately
    // suite-wide (one instance for every subclass), so there is no single
    // point where closing it is correct. Ryuk reaps it when the JVM exits;
    // the shutdown hook below makes that close explicit in code.
    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withInitScript("db/init/01-app-role.sql");

    static {
        // Started by hand rather than with @Container so that one container is
        // shared by every subclass, instead of one per test class.
        POSTGRES.start();
        Runtime.getRuntime().addShutdownHook(new Thread(POSTGRES::stop));
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "evrental");
        registry.add("spring.datasource.password", () -> "evrental");
    }
}
