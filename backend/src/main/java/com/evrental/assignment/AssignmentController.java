package com.evrental.assignment;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.UnauthorizedException;
import com.evrental.rider.RiderResponse;
import com.evrental.rider.RiderService;
import com.evrental.user.UserRepository;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The three recorded assignment events — assign, exchange, deboard (screens
 * 10–12). Each one moves both sides in a single call, because that is the
 * invariant the spreadsheet keeps breaking: a bike marked DEPLOYED with nobody
 * on it, or a rider holding a bike that is also sitting in the workshop.
 *
 * <p>Every endpoint is SA/FA/FS — the Assignments section in RBAC.md is theirs,
 * and SERVICE_MANAGER never sees it. The response is the rider, as the mock
 * returns it, with currentVehicleId reflecting the event that just happened.
 */
@RestController
@RequestMapping("/api/v1/assignments")
public class AssignmentController {

    private final AssignmentService assignmentService;
    private final RiderService riderService;
    private final UserRepository users;

    public AssignmentController(AssignmentService assignmentService,
                                RiderService riderService,
                                UserRepository users) {
        this.assignmentService = assignmentService;
        this.riderService = riderService;
        this.users = users;
    }

    /**
     * The caller, as the lifecycle log needs them. The JWT carries the user id
     * but deliberately not the name — a name inside a token goes stale — so
     * the name is read fresh, under the caller's tenant, which RLS permits
     * because it is their own row. Same pattern as VehicleController.
     */
    private String actorName(JwtPrincipal principal) {
        return users.findById(principal.userId())
                .map(com.evrental.user.User::getName)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));
    }

    @PostMapping("/assign")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public RiderResponse assign(@Valid @RequestBody AssignVehicleRequest request,
                                Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return riderService.toResponse(assignmentService.assign(
                request, principal.tenantId(), principal.userId(), actorName(principal)));
    }

    @PostMapping("/exchange")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public RiderResponse exchange(@Valid @RequestBody ExchangeVehicleRequest request,
                                  Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return riderService.toResponse(assignmentService.exchange(
                request, principal.tenantId(), principal.userId(), actorName(principal)));
    }

    @PostMapping("/deboard")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public RiderResponse deboard(@Valid @RequestBody DeboardRiderRequest request,
                                 Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return riderService.toResponse(assignmentService.deboard(
                request, principal.tenantId(), principal.userId(), actorName(principal)));
    }

    /**
     * The settlements waiting on a decision.
     *
     * <p>SA/FA only: approving one writes to the money ledger. RBAC.md's
     * conflict 4 says the approval is a Fleet Admin's, and the deboard that
     * records the figures is deliberately not.
     */
    @GetMapping("/settlements")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public java.util.List<SettlementResponse> pendingSettlements() {
        return assignmentService.pendingSettlements();
    }

    @PostMapping("/settlements/{assignmentId}/approve")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public SettlementResponse approveSettlement(@PathVariable UUID assignmentId,
                                                Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return assignmentService.approveSettlement(assignmentId, actorName(principal));
    }
}
