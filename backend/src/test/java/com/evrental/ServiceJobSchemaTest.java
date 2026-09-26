package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * What V006 actually built.
 *
 * <p>Worth its own test because the three things checked here are the ones
 * that fail silently. A table without FORCE row-level security reads as
 * protected and is not; a missing partial index turns a race into two open
 * jobs rather than a 409; and a foreign key that was written as a VARCHAR
 * would let a job point at a bike that never existed.
 */
class ServiceJobSchemaTest extends ServiceJobTestBase {

    private static final List<String> TABLES =
            List.of("service_jobs", "service_job_events", "service_job_items", "qc_inspections");

    @Test
    void everyServiceTableEnforcesRowLevelSecurityOnItsOwner() {
        for (String table : TABLES) {
            Boolean enabled = superAdmin(jdbc -> jdbc.queryForObject(
                    "SELECT relrowsecurity FROM pg_class WHERE relname = ?", Boolean.class, table));
            Boolean forced = superAdmin(jdbc -> jdbc.queryForObject(
                    "SELECT relforcerowsecurity FROM pg_class WHERE relname = ?", Boolean.class, table));

            assertThat(enabled).as("%s has row-level security", table).isTrue();
            // The one that is easy to miss: without FORCE the owning role --
            // which the application connects as -- ignores its own policy.
            assertThat(forced).as("%s forces row-level security on its owner", table).isTrue();
        }
    }

    @Test
    void onlyOneOpenJobPerBikeIsPossibleAtTheDatabaseLevel() {
        String indexDef = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_sj_one_active_per_vehicle'",
                String.class));

        assertThat(indexDef)
                .contains("UNIQUE")
                .contains("tenant_id")
                .contains("vehicle_id")
                // Partial, so a bike can come back next week without anyone
                // deleting the history of the last visit.
                .contains("WHERE");
    }

    @Test
    void aJobCannotPointAtABikeThatIsNotThere() {
        Integer foreignKeys = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu
                  ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_name = 'service_jobs'
                  AND tc.constraint_type = 'FOREIGN KEY'
                  AND ccu.table_name = 'vehicles'
                """, Integer.class));

        assertThat(foreignKeys).isEqualTo(1);
    }

    @Test
    void aJobCannotCloseWithoutNamingWhoPays() {
        Integer constraints = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM pg_constraint
                WHERE conname = 'chk_sj_closed_has_liability'
                """, Integer.class));

        assertThat(constraints).isEqualTo(1);
    }
}
