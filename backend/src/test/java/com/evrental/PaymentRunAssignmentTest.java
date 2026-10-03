package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The run bills the days a rider actually held a bike, and names the bike.
 *
 * <p>Until now it did neither. {@code payment.AssignmentQuery} had one
 * implementation — {@code NoAssignmentsYet}, which answers empty for every
 * rider — and S5 shipping did not change that, because the assignment module
 * published a <i>different</i> interface that happens to share the name. So
 * every row billed a full seven days and carried a null vehicle, on a database
 * that knew exactly which bike the rider had and when they gave it back.
 *
 * <p>That is wrong money, not a missing screen: a rider who hands the bike
 * back on Wednesday was billed to Sunday.
 */
class PaymentRunAssignmentTest extends PaymentRunTestBase {

    /**
     * The base gives every fixture rider an open assignment, because the run
     * now bills days held. These tests are about what those rows say, so each
     * one starts from none and writes exactly the history it is testing.
     *
     * <p>JUnit runs a superclass {@code @BeforeEach} before a subclass's, so
     * this lands after the fixture is built and clears it.
     */
    @org.junit.jupiter.api.BeforeEach
    void clearAssignments() {
        superAdmin(jdbc -> jdbc.update("DELETE FROM assignments WHERE tenant_id IN (?, ?)",
                TENANT, OTHER_TENANT));
    }

    /** Opens an assignment for a rider over a given window. */
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

    @Test
    void aRiderHoldingABikeAllWeekIsBilledTheWholeWeekAndTheBikeIsNamed() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(3), null);

        mvc.perform(get("/api/v1/payments/runs/current")
                        .param("billingDay", "MONDAY")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].daysBilled").value(7))
                // The bike an operator reads off the frame, not a row id.
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId").value("BLRSS0428"));
    }

    /** The case that was being overcharged: handed back mid-week. */
    @Test
    void aMidWeekDeboardIsBilledOnlyTheDaysHeld() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        // Monday through Wednesday inclusive is three days.
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(2), start.plusDays(2));

        mvc.perform(get("/api/v1/payments/runs/current")
                        .param("billingDay", "MONDAY")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].daysBilled").value(3))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId").value("BLRSS0428"));
    }

    /** Picked the bike up mid-week: billed from the day they took it. */
    @Test
    void aMidWeekAssignIsBilledFromTheDayItStarted() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        // Thursday onward is Thursday to Sunday, four days.
        assignment(MONDAY_RIDER, vehicleId, start.plusDays(3), null);

        mvc.perform(get("/api/v1/payments/runs/current")
                        .param("billingDay", "MONDAY")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].daysBilled").value(4));
    }

    /**
     * A rider with no bike at all this week. The row still exists — a run that
     * silently omits people is how somebody stops being billed by accident —
     * but it bills nothing and names nothing.
     */
    @Test
    void aRiderWithNoBikeThisWeekIsBilledNothing() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(6), start.minusWeeks(4));

        mvc.perform(get("/api/v1/payments/runs/current")
                        .param("billingDay", "MONDAY")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].daysBilled").value(0))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].billedAmount").value(0))
                // A filtered path returns a list, so the absence of a bike is
                // a list holding null rather than no value at all.
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId")
                        .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.nullValue())));
    }

    /**
     * Two bikes in one week, because the rider exchanged mid-week. The run
     * bills the days held across both and names the one they ended on — a
     * period carries a single vehicle column, and the bike they have now is
     * the one an operator chasing the payment needs.
     */
    @Test
    void anExchangeMidWeekBillsTheDaysHeldAcrossBothBikes() throws Exception {
        LocalDate start = currentPeriodStart(com.evrental.rider.BillingDay.MONDAY);
        UUID second = insertVehicle(TENANT, "BLRSS0429", "CHASSIS0429");
        assignment(MONDAY_RIDER, vehicleId, start.minusWeeks(1), start.plusDays(2));
        assignment(MONDAY_RIDER, second, start.plusDays(3), null);

        mvc.perform(get("/api/v1/payments/runs/current")
                        .param("billingDay", "MONDAY")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].daysBilled").value(7))
                .andExpect(jsonPath("$.rows[?(@.riderName == 'Anil Shetty')].vehicleId").value("BLRSS0429"));
    }
}
