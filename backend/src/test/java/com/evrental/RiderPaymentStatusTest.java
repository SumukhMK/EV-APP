package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * The payment chip on a rider says what the ledger says.
 *
 * <p>It used to say "PENDING" for everybody, always — {@code RiderResponse}
 * wrote the string in by hand. So a rider's profile showed Pending above a
 * payment history showing Paid, on the same screen, and the riders list
 * coloured every chip the same. Invisible against the fixtures, which carry a
 * status per rider; live, it was one word repeated down the page.
 */
class RiderPaymentStatusTest extends PaymentRunTestBase {

    @Test
    void aRiderWhoHasPaidReadsPaid() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        insertPeriod(TENANT, MONDAY_RIDER, start, com.evrental.rider.BillingDay.MONDAY, 175000L, 175000L, "PENDING");

        mvc.perform(get("/api/v1/riders/" + MONDAY_RIDER)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("PAID"));
    }

    @Test
    void aRiderWhoHasPaidSomethingReadsPartial() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        insertPeriod(TENANT, MONDAY_RIDER, start, com.evrental.rider.BillingDay.MONDAY, 175000L, 50000L, "PENDING");

        mvc.perform(get("/api/v1/riders/" + MONDAY_RIDER)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("PARTIAL"));
    }

    /** A week that closed while still short is overdue, whatever the row says. */
    @Test
    void aClosedWeekStillShortReadsOverdue() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY).minusWeeks(3);
        insertPeriod(TENANT, MONDAY_RIDER, start, com.evrental.rider.BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/riders/" + MONDAY_RIDER)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("OVERDUE"));
    }

    /** Never billed is not the same as owing. */
    @Test
    void aRiderWithNoBillingHistoryReadsPending() throws Exception {
        mvc.perform(get("/api/v1/riders/" + MONDAY_RIDER)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("PENDING"));
    }

    /** The list is answered in one batch, and agrees with the profile. */
    @Test
    void theListCarriesTheSameStatusAsTheProfile() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        insertPeriod(TENANT, MONDAY_RIDER, start, com.evrental.rider.BillingDay.MONDAY, 175000L, 175000L, "PENDING");
        insertPeriod(TENANT, CHARGED_RIDER, start, com.evrental.rider.BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/riders")
                        .param("size", "50")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.name == 'Anil Shetty')].paymentStatus").value("PAID"))
                .andExpect(jsonPath("$.content[?(@.name == 'Bhavana Rao')].paymentStatus").value("PENDING"));
    }

    /** An older settled week does not mask this week's unpaid one. */
    @Test
    void theMostRecentPeriodIsTheOneThatCounts() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        insertPeriod(TENANT, MONDAY_RIDER, start.minusWeeks(2), com.evrental.rider.BillingDay.MONDAY, 175000L, 175000L, "PENDING");
        insertPeriod(TENANT, MONDAY_RIDER, start, com.evrental.rider.BillingDay.MONDAY, 175000L, 0L, "PENDING");

        mvc.perform(get("/api/v1/riders/" + MONDAY_RIDER)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("PENDING"));
    }
}
