package com.evrental.dashboard;

/**
 * The shapes the dashboard screens read, matching
 * {@code frontend/app/src/types/dashboard.ts} field for field. They live in
 * one file because they are one contract — a tile added to the screen changes
 * a record here and the TypeScript interface, and keeping them adjacent makes
 * a drift between the two visible in one diff.
 */
public final class DashboardResponses {

    private DashboardResponses() {}

    /**
     * The eight tiles on the dashboard.
     *
     * <p>{@code overdueRiders} and {@code overdueValue} are money, and
     * RBAC.md puts money behind SUPER_ADMIN and FLEET_ADMIN. For the other two
     * roles they come back as zero rather than the endpoint refusing: the
     * fleet half of this response is theirs to see, and a 403 for the whole
     * dashboard because of two fields would be the wrong trade.
     */
    public record FleetSummary(
            long totalFleet,
            long deployed,
            long readyToDeploy,
            long underRepair,
            long qcPending,
            long accident,
            long recovery,
            long overdueRiders,
            long overdueValue) {}

    /** One hub's share of its bikes that are out. */
    public record HubUtilisation(String hub, long total, long deployed, long idle, int percent) {}

    /** One month of the deployments chart. {@code month} is "2026-08". */
    public record MonthlyDeployments(String month, long count) {}

    public record OperationsSummary(Movement movement, Outcome outcome, Source source) {

        /** How bikes moved in the window. */
        public record Movement(long deployed, long exchanged, long returned, long recovered) {}

        /** What state they landed in, counted from the lifecycle log. */
        public record Outcome(long readyToDeploy, long underRepair, long qcPending, long accident) {}

        /** Where the service demand came from. */
        public record Source(long rsa, long walkIn, long qrt) {}
    }

    public record RecoveryCounts(NeedToRecover needToRecover, Recovered recovered) {

        /**
         * {@code missing} is always zero and deliberately so. The mock derived
         * it as 20% of the recovery queue, which was a number with no fact
         * behind it; the registry has no "missing" state, and inventing one
         * here would put a fabricated figure on a screen people act on. It
         * stays in the shape because the screen renders the row, and it
         * becomes real the day a bike can be marked missing.
         */
        public record NeedToRecover(
                long partiallyPaid, long notPaid, long leftAtRoadside, long missing, long accident) {}

        public record Recovered(long recovered) {}
    }
}
