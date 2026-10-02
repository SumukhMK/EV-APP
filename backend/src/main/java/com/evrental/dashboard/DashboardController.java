package com.evrental.dashboard;

import com.evrental.auth.JwtPrincipal;
import com.evrental.dashboard.DashboardResponses.FleetSummary;
import com.evrental.dashboard.DashboardResponses.HubUtilisation;
import com.evrental.dashboard.DashboardResponses.MonthlyDeployments;
import com.evrental.dashboard.DashboardResponses.OperationsSummary;
import com.evrental.dashboard.DashboardResponses.RecoveryCounts;
import com.evrental.common.ValidationException;
import com.evrental.user.UserRole;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The dashboard, Today's Operations and the recovery board.
 *
 * <p>Every role that can sign in can see these, which is the point of a
 * dashboard — but the two money figures inside them are SA/FA only, so they
 * come back as zero for the other roles rather than the request being refused.
 * A SERVICE_MANAGER opening the dashboard should see the workshop's numbers,
 * not a 403.
 *
 * <p>These replace {@code mocks/dashboard.ts}, which derived every tile from
 * the fixture arrays in the browser — and derived the Today's Operations
 * strips from a hash of the date, so they changed daily and meant nothing.
 */
@RestController
@RequestMapping("/api/v1/dashboard")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
public class DashboardController {

    /** A chart wider than this is a query nobody asked for. */
    private static final int MAX_MONTHS = 36;

    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping("/fleet-summary")
    public FleetSummary fleetSummary(Authentication authentication) {
        return dashboard.fleetSummary(canSeeMoney(authentication));
    }

    @GetMapping("/hub-utilisation")
    public List<HubUtilisation> hubUtilisation() {
        return dashboard.hubUtilisation();
    }

    @GetMapping("/monthly-deployments")
    public List<MonthlyDeployments> monthlyDeployments(
            @RequestParam(defaultValue = "13") int months) {
        if (months < 1 || months > MAX_MONTHS) {
            throw new ValidationException("months", "Ask for between 1 and " + MAX_MONTHS + " months");
        }
        return dashboard.monthlyDeployments(months);
    }

    /**
     * @param from inclusive; defaults with {@code to} to today, which is what
     *             "Today's Operations" means on first load.
     * @param to   inclusive
     */
    @GetMapping("/operations-summary")
    public OperationsSummary operationsSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        LocalDate end = to == null ? LocalDate.now() : to;
        LocalDate start = from == null ? end : from;
        if (start.isAfter(end)) {
            throw new ValidationException("from", "The start of the range is after its end");
        }
        return dashboard.operationsSummary(start, end);
    }

    @GetMapping("/recovery-counts")
    public RecoveryCounts recoveryCounts(Authentication authentication) {
        return dashboard.recoveryCounts(canSeeMoney(authentication));
    }

    /** RBAC.md, Money: "FS and SM never see the section". */
    private static boolean canSeeMoney(Authentication authentication) {
        UserRole role = ((JwtPrincipal) authentication.getPrincipal()).role();
        return role == UserRole.SUPER_ADMIN || role == UserRole.FLEET_ADMIN;
    }
}
