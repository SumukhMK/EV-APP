package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The smoke test for stage S0: the context starts, Flyway runs V001 against a
 * real Postgres, and Hibernate validates its mappings against the result.
 *
 * <p>It is one assertion and it catches the whole class of mistake that makes a
 * skeleton worthless — a migration that does not apply, a property with no
 * value, a bean that cannot be built.
 */
class EvRentalApplicationTests extends PostgresTestBase {

    @Autowired
    DataSource dataSource;

    @Test
    void contextLoadsAndMigrationsHaveRun() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        Integer applied = jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class);
        assertThat(applied).isGreaterThanOrEqualTo(1);

        // The platform tenant V001 seeds — super admins have to belong somewhere.
        String platform = jdbc.queryForObject(
                "SELECT name FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001'", String.class);
        assertThat(platform).isEqualTo("Platform");
    }
}
