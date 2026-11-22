package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Rent runs for the days a rider actually held a bike, and Collections names
 * the bike they hold now. An exchange continues the account; a deboard ends it.
 */
class PaymentRunAssignmentTest extends PaymentRunTestBase {

    /** Each test writes exactly the bike history it is about. */
    @org.junit.jupiter.api.BeforeEach
    void clearAssignments() {
        superAdmin(jdbc -> jdbc.update("DELETE FROM assignments WHERE tenant_id IN (?, ?)",
                TENANT, OTHER_TENANT));
    }

    private void assignment(UUID riderId, UUID vehicle, LocalDate from, LocalDate to) {
        superAdmin(jdbc -> jdbc.update("""
                INSERT INTO assignments (tenant_id, rider_id, vehicle_id, started_on, ended_on,
                                         reason, return_condition, next_vehicle_state, closed_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                TENANT, riderId, vehicle, from, to,
                to == null ? null : "RETURNED",
                to == null ? null : "NONE",
                to == null ? null : "QC_PENDING",
                to == null ? null : "Test"));
    }

    /** Rent for the days from {@code from} to today: whole weeks at the plan, the rest per day. */
    private long rentSince(LocalDate from) {
        long days = Math.max(0, today().toEpochDay() - from.toEpochDay() + 1);
        return (days / 7) * ROUNDING_PLAN_PAISE + (days % 7) * Math.round(ROUNDING_PLAN_PAISE / 7.0);
    }

    private org.springframework.test.web.servlet.ResultActions collections() throws Exception {
        return mvc.perform(get("/api/v1/payments/collections")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());
    }

    @Test
    void aRiderHoldingABikeAllWeekPaysForEveryDaySoFarAndTheBikeIsNamed() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(3), null);

        collections()
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].weekRent").value((int) rentSince(start)))
                // The bike an operator reads off the frame, not a row id.
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId").value("BLRSS0428"));
    }

    /**
     * Handed back mid-week: the account stops. The days held are settled
     * through the deboard's outstanding rent, which becomes a charge —
     * billing them here as well would charge them twice.
     */
    @Test
    void aMidWeekDeboardStopsTheRent() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(2), start.minusDays(1));

        collections()
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].weekRent").value(0))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].owes").value(0))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId")
                        .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.nullValue())));
    }

    /** Took the bike mid-week: rent from that day. */
    @Test
    void aMidWeekAssignPaysFromTheDayItStarted() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        LocalDate took = today().isAfter(start) ? start.plusDays(1) : start;
        assignment(MONDAY_RIDER, vehicleId, took, null);

        collections()
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].weekRent").value((int) rentSince(took)));
    }

    /** An exchange closes one bike and opens the next: the account carries on, naming the new bike. */
    @Test
    void anExchangeCarriesTheAccountOnToTheNewBike() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        UUID second = insertVehicle(TENANT, "BLRSS0429", "CHASSIS0429");
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(1), today().minusDays(1));
        assignment(MONDAY_RIDER, second, today(), null);

        collections()
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].weekRent").value((int) rentSince(start)))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId").value("BLRSS0429"));
    }
}
