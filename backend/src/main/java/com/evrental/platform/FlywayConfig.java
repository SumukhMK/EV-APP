package com.evrental.platform;

import org.flywaydb.core.Flyway;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Repairs the {@code flyway_schema_history} table before every migrate.
 *
 * <p>{@code repair()} only rewrites Flyway's own bookkeeping — it recomputes
 * the checksum of every already-applied migration from the file on disk and
 * drops any row left behind by a failed run. It never touches an application
 * table or a row of tenant data, so it is safe to run unconditionally on
 * every boot rather than by hand against production once and never again.
 *
 * <p>Why this exists: a migration file committed and deployed once can still
 * end up with a stored checksum that disagrees with the file Flyway reads on
 * the next boot (for example, a deploy that ran before a later commit
 * amended history, or a hand-edited row). Without a repair step that mismatch
 * fails {@code validate} and the app never starts — {@code ddl-auto: validate}
 * then has nothing to check against. Repairing first turns that hard failure
 * into a no-op when history is already consistent.
 */
@Configuration
public class FlywayConfig {

    @Bean
    public FlywayMigrationStrategy repairAndMigrate() {
        return (Flyway flyway) -> {
            flyway.repair();
            flyway.migrate();
        };
    }
}
