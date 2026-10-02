package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * The aggregates behind the dashboard, Today's Operations and the recovery
 * board.
 *
 * <p>These replace {@code mocks/dashboard.ts}, which counted fixture arrays in
 * the browser and, for the operations strips, derived numbers from a hash of
 * the date. So the thing worth testing is not "does it return JSON" but "does
 * each figure count the row it claims to count" — the mock's numbers were
 * plausible, which is exactly why nobody noticed they were invented.
 */
class DashboardTest extends VehicleTestBase {

    @Test
    void fleetSummaryCountsEachStateAndExcludesRetiredFromTheTotal() throws Exception {
        insertVehicle("DASH0001", "DCH-0001", VehicleState.DEPLOYED);
        insertVehicle("DASH0002", "DCH-0002", VehicleState.DEPLOYED);
        insertVehicle("DASH0003", "DCH-0003", VehicleState.READY_TO_DEPLOY);
        insertVehicle("DASH0004", "DCH-0004", VehicleState.UNDER_REPAIR);
        insertVehicle("DASH0005", "DCH-0005", VehicleState.QC_PENDING);
        insertVehicle("DASH0006", "DCH-0006", VehicleState.ACCIDENT);
        insertVehicle("DASH0007", "DCH-0007", VehicleState.RECOVERY);
        insertVehicle("DASH0008", "DCH-0008", VehicleState.RETIRED);

        mvc.perform(get("/api/v1/dashboard/fleet-summary")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                // Eight bikes inserted, one retired: a retired bike has left
                // the fleet and must not inflate the total the tiles sit under.
                .andExpect(jsonPath("$.totalFleet").value(7))
                .andExpect(jsonPath("$.deployed").value(2))
                .andExpect(jsonPath("$.readyToDeploy").value(1))
                .andExpect(jsonPath("$.underRepair").value(1))
                .andExpect(jsonPath("$.qcPending").value(1))
                .andExpect(jsonPath("$.accident").value(1))
                .andExpect(jsonPath("$.recovery").value(1));
    }

    /** RBAC.md, Money: "FS and SM never see the section". */
    @Test
    void theMoneyTilesAreZeroForRolesThatCannotSeeMoney() throws Exception {
        insertVehicle("DASH0010", "DCH-0010", VehicleState.DEPLOYED);

        mvc.perform(get("/api/v1/dashboard/fleet-summary")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isOk())
                // The fleet half is theirs to see...
                .andExpect(jsonPath("$.deployed").value(1))
                // ...the money half is not, and it is zero rather than a 403.
                .andExpect(jsonPath("$.overdueRiders").value(0))
                .andExpect(jsonPath("$.overdueValue").value(0));
    }

    @Test
    void theDashboardIsSignedInOnly() throws Exception {
        mvc.perform(get("/api/v1/dashboard/fleet-summary"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void hubUtilisationIsDeployedAsAShareOfTheHub() throws Exception {
        // insertVehicle puts everything in Koramangala, so one hub with a
        // known split is enough to pin the arithmetic.
        insertVehicle("DASH0020", "DCH-0020", VehicleState.DEPLOYED);
        insertVehicle("DASH0021", "DCH-0021", VehicleState.DEPLOYED);
        insertVehicle("DASH0022", "DCH-0022", VehicleState.DEPLOYED);
        insertVehicle("DASH0023", "DCH-0023", VehicleState.READY_TO_DEPLOY);

        mvc.perform(get("/api/v1/dashboard/hub-utilisation")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].hub").value("Koramangala"))
                .andExpect(jsonPath("$[0].total").value(4))
                .andExpect(jsonPath("$[0].deployed").value(3))
                .andExpect(jsonPath("$[0].idle").value(1))
                .andExpect(jsonPath("$[0].percent").value(75));
    }

    /** A retired bike is not idle capacity; it is gone. */
    @Test
    void hubUtilisationIgnoresRetiredBikes() throws Exception {
        insertVehicle("DASH0030", "DCH-0030", VehicleState.DEPLOYED);
        insertVehicle("DASH0031", "DCH-0031", VehicleState.RETIRED);

        mvc.perform(get("/api/v1/dashboard/hub-utilisation")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].total").value(1))
                .andExpect(jsonPath("$[0].percent").value(100));
    }

    /**
     * The chart's months come from the calendar, not from the rows: a month
     * nobody deployed in is a zero on the chart, and SQL returns no row for it.
     */
    @Test
    void monthlyDeploymentsReturnsAContinuousSeriesEndingThisMonth() throws Exception {
        mvc.perform(get("/api/v1/dashboard/monthly-deployments")
                        .param("months", "6")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[5].month").value(java.time.YearMonth.now().toString()))
                .andExpect(jsonPath("$[0].count").isNumber());
    }

    @Test
    void anAbsurdMonthCountIsRefused() throws Exception {
        mvc.perform(get("/api/v1/dashboard/monthly-deployments")
                        .param("months", "500")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void operationsSummaryAnswersTheThreeStripsForAWindow() throws Exception {
        String today = LocalDate.now().toString();

        mvc.perform(get("/api/v1/dashboard/operations-summary")
                        .param("from", today)
                        .param("to", today)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movement.deployed").isNumber())
                .andExpect(jsonPath("$.movement.exchanged").isNumber())
                .andExpect(jsonPath("$.movement.returned").isNumber())
                .andExpect(jsonPath("$.movement.recovered").isNumber())
                .andExpect(jsonPath("$.outcome.readyToDeploy").isNumber())
                .andExpect(jsonPath("$.source.rsa").isNumber())
                .andExpect(jsonPath("$.source.walkIn").isNumber())
                .andExpect(jsonPath("$.source.qrt").isNumber());
    }

    /**
     * The lifecycle log is what the outcome strip counts, so a transition made
     * today has to appear in today's window.
     */
    @Test
    void theOutcomeStripCountsTodaysTransitions() throws Exception {
        java.util.UUID vehicleId = insertVehicle("DASH0040", "DCH-0040", VehicleState.UNDER_REPAIR);
        superAdmin(jdbc -> jdbc.update(
                "INSERT INTO vehicle_lifecycle_events (tenant_id, vehicle_id, from_state, to_state, actor_name) "
                        + "VALUES (?, ?, 'UNDER_REPAIR', 'QC_PENDING', 'Test')",
                TENANT, vehicleId));

        String today = LocalDate.now().toString();
        mvc.perform(get("/api/v1/dashboard/operations-summary")
                        .param("from", today).param("to", today)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome.qcPending").value(1));
    }

    @Test
    void aBackwardsRangeIsRefused() throws Exception {
        mvc.perform(get("/api/v1/dashboard/operations-summary")
                        .param("from", "2026-10-02").param("to", "2026-10-01")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void recoveryCountsReadsTheRegistryAndReportsMissingAsZero() throws Exception {
        insertVehicle("DASH0050", "DCH-0050", VehicleState.ACCIDENT);
        insertVehicle("DASH0051", "DCH-0051", VehicleState.ACCIDENT);

        mvc.perform(get("/api/v1/dashboard/recovery-counts")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.needToRecover.accident").value(2))
                // The mock made this up as 20% of the recovery queue. There is
                // no "missing" state in the registry, so it is honestly zero
                // until there is one.
                .andExpect(jsonPath("$.needToRecover.missing").value(0))
                .andExpect(jsonPath("$.recovered.recovered").isNumber());
    }

    @Test
    void aServiceManagerSeesTheFleetButNotTheMoneyOnTheRecoveryBoard() throws Exception {
        mvc.perform(get("/api/v1/dashboard/recovery-counts")
                        .header("Authorization", "Bearer " + tokenFor(SERVICE_MANAGER_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.needToRecover.partiallyPaid").value(0))
                .andExpect(jsonPath("$.needToRecover.notPaid").value(0));
    }

    /** Another tenant's bikes are not in these numbers. RLS, not a predicate. */
    @Test
    void theCountsAreScopedToTheCallersTenant() throws Exception {
        insertVehicle(OTHER_TENANT, "DASH0060", "DCH-0060", VehicleState.DEPLOYED);
        insertVehicle("DASH0061", "DCH-0061", VehicleState.DEPLOYED);

        mvc.perform(get("/api/v1/dashboard/fleet-summary")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalFleet").value(1))
                .andExpect(jsonPath("$.deployed").value(1));
    }
}
