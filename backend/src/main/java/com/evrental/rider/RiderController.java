package com.evrental.rider;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.Facet;
import com.evrental.common.PageResponse;
import com.evrental.vehicle.VehicleState;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The rider register.
 *
 * <p>Every endpoint is SA/FA/FS — the Riders section in RBAC.md is theirs,
 * and SERVICE_MANAGER never sees it. That is the whole gate: there is no
 * transition to police yet, because nothing changes a rider's status in S2.
 *
 * <p>No update endpoint. No edit screen exists, and "CRUD" ships as create +
 * read + list; an update lands when the screen does.
 */
@RestController
@RequestMapping("/api/v1/riders")
public class RiderController {

    private final RiderService riderService;
    private final com.evrental.user.UserRepository users;

    public RiderController(RiderService riderService, com.evrental.user.UserRepository users) {
        this.riderService = riderService;
        this.users = users;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public RiderResponse onboard(@Valid @RequestBody OnboardRiderRequest request,
                                 Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return RiderResponse.from(riderService.onboard(request, principal.tenantId()));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public PageResponse<RiderResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String vehicleState) {
        RiderQuery query = new RiderQuery(q, parseStatus(status), platform, parseVehicleState(vehicleState));
        Page<Rider> found = riderService.search(query, PageRequest.of(page, Math.min(size, 100), Sort.by("id")));
        // Batched, not per row: toResponse issues two derived-field queries,
        // and this is the most-opened screen in the product.
        List<RiderResponse> rows = riderService.toResponses(found.getContent());
        return new PageResponse<>(rows, found.getNumber(), found.getSize(),
                found.getTotalElements(), found.getTotalPages());
    }

    @GetMapping("/facets")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public List<Facet<String>> facets(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String vehicleState) {
        return riderService.facets(new RiderQuery(q, null, platform, parseVehicleState(vehicleState)));
    }

    /** Riders a bike can be assigned to: on the register and not holding one. */
    @GetMapping("/assignable")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public List<RiderResponse> assignable() {
        return riderService.toResponses(riderService.assignable());
    }

    /** Riders actually holding a bike. */
    @GetMapping("/assigned")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public List<RiderResponse> assigned() {
        return riderService.toResponses(riderService.assigned());
    }

    @GetMapping("/{riderCode}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public RiderDetailResponse get(@PathVariable String riderCode) {
        return riderService.toDetailResponse(riderService.findByRiderCode(riderCode));
    }

    /**
     * Changes a rider's weekly plan.
     *
     * <p>SA/FA only: the plan is what the rider is billed every week
     * afterwards, so it is a money decision.
     */
    @PostMapping("/{riderCode}/plan")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public RiderResponse changePlan(@PathVariable String riderCode,
                                    @Valid @RequestBody ChangePlanRequest request,
                                    Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        Rider rider = riderService.findByRiderCode(riderCode);
        return riderService.toResponse(
                riderService.changePlan(rider.getId(), request.planAmount(), actorNameOf(principal)));
    }

    /**
     * Records the KYC decision for a rider.
     *
     * <p>SUPER_ADMIN and FLEET_ADMIN only. Deciding whether someone's
     * identity documents are acceptable is not a counter task, and the rest
     * of the register being open to FLEET_STAFF does not make this so.
     */
    @PostMapping("/{riderCode}/kyc")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public RiderResponse decideKyc(@PathVariable String riderCode, @RequestBody KycDecisionRequest request) {
        Rider rider = riderService.findByRiderCode(riderCode);
        return riderService.toResponse(riderService.decideKyc(rider.getId(), request.decision()));
    }


    private static RiderStatus parseStatus(String status) {
        return status == null || status.isBlank() || "ALL".equals(status)
                ? null : RiderStatus.valueOf(status);
    }

    private static VehicleState parseVehicleState(String state) {
        return state == null || state.isBlank() || "ALL".equals(state)
                ? null : VehicleState.valueOf(state);
    }

    /** The name that goes on the audit trail, read from the caller's record. */
    private String actorNameOf(JwtPrincipal principal) {
        return users.findById(principal.userId())
                .map(com.evrental.user.User::getName)
                .orElse("Unknown");
    }
}
