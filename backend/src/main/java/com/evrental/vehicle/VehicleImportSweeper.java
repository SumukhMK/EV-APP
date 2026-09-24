package com.evrental.vehicle;

import java.time.Instant;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Abandoned previews. Someone uploads a file, sees the errors, closes the tab,
 * and the staged batch stays for ever -- so a daily sweep marks anything still
 * PENDING after 24 hours EXPIRED and deletes its rows. The import row itself
 * stays: "an import was attempted and abandoned" is worth keeping, and it is
 * one small row.
 *
 * <p>Runs under the super-admin sentinel, because it is a cross-tenant job.
 */
@Component
public class VehicleImportSweeper {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public VehicleImportSweeper(DataSource dataSource, PlatformTransactionManager txManager) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.tx = new TransactionTemplate(txManager);
    }

    @Scheduled(cron = "0 15 3 * * *")
    public void expireAbandonedImports() {
        tx.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT set_config('app.tenant_id', '*', true)", String.class);
            jdbc.update("""
                    DELETE FROM vehicle_import_rows
                    WHERE import_id IN (
                      SELECT id FROM vehicle_imports
                      WHERE status = 'PENDING' AND uploaded_on < now() - interval '24 hours'
                    )
                    """);
            jdbc.update("""
                    UPDATE vehicle_imports
                    SET status = 'EXPIRED'
                    WHERE status = 'PENDING' AND uploaded_on < now() - interval '24 hours'
                    """);
        });
    }
}
