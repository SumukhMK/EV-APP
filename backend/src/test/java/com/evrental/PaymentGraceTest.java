package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * How long a rider has been short, and whether that is still acceptable.
 *
 * <p>The run screen showed neither. It printed a status chip — Pending,
 * Overdue — with no sense of age, so a rider one day late and a rider three
 * weeks late looked identical on the screen the chasing is done from. The
 * operator's actual question, "how long has this been going on", had no
 * answer anywhere except by opening each receipt.
 *
 * <p>The buffer is the business rule behind it: this operator allows three
 * days past the end of the week before a rider is chased. It is configurable
 * because three is their number, not a fact about fleets.
 */
class PaymentGraceTest extends PaymentRunTestBase {

    @Test
    void theCurrentWeekIsNotOverdueWhileItIsStillRunning() throws Exception {
        LocalDate start = currentPeriodStart(BillingDay.MONDAY);
        insertPeriod(TENANT, MONDAY_RIDER, start, BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/payments/runs/current?billingDay=MONDAY")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].daysOverdue").value(0))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].pastGrace").value(false));
    }

    /**
     * Inside the buffer: the week closed and the money is short, but this
     * operator does not chase for three days.
     */
    @Test
    void aRiderTwoDaysLateIsOverdueButStillInsideTheBuffer() throws Exception {
        LocalDate end = today().minusDays(2);
        insertPeriod(TENANT, MONDAY_RIDER, end.minusDays(6), BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].daysOverdue").value(2))
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].pastGrace").value(false));
    }

    /** Past it: four days late, with a three-day buffer, is a rider to chase. */
    @Test
    void aRiderPastTheBufferIsFlagged() throws Exception {
        LocalDate end = today().minusDays(4);
        insertPeriod(TENANT, MONDAY_RIDER, end.minusDays(6), BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].daysOverdue").value(4))
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].pastGrace").value(true));
    }

    /** The boundary itself is still inside. Three days of buffer means three. */
    @Test
    void exactlyTheBufferIsStillInsideIt() throws Exception {
        LocalDate end = today().minusDays(3);
        insertPeriod(TENANT, MONDAY_RIDER, end.minusDays(6), BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].daysOverdue").value(3))
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].pastGrace").value(false));
    }

    /** Money in clears it: a settled week never reaches the overdue list at all. */
    @Test
    void aSettledWeekIsNotOverdueHoweverOld() throws Exception {
        LocalDate end = today().minusDays(30);
        insertPeriod(TENANT, MONDAY_RIDER, end.minusDays(6), BillingDay.MONDAY, 175000L, 175000L, "PAID");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')]").isEmpty());
    }

    /** The ladder is separate from the buffer and keeps its own thresholds. */
    @Test
    void theDunningLadderIsUnchangedByTheBuffer() throws Exception {
        LocalDate end = today().minusDays(8);
        insertPeriod(TENANT, MONDAY_RIDER, end.minusDays(6), BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/payments/overdue")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].pastGrace").value(true))
                .andExpect(jsonPath("$[?(@.riderName == 'Anil Shetty')].stage").value("WARNING_1"));
    }
}
