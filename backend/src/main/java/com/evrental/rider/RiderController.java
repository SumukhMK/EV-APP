package com.evrental.rider;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.Facet;
import com.evrental.common.PageResponse;
import com.evrental.vehicle.VehicleState;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
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

    public RiderController(RiderService riderService) {
        this.riderService = riderService;
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
        return PageResponse.from(
                riderService.search(query, PageRequest.of(page, Math.min(size, 100), Sort.by("id"))),
                riderService::toResponse);
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
        return riderService.assignable().stream().map(riderService::toResponse).toList();
    }

    /** Riders actually holding a bike. */
    @GetMapping("/assigned")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public List<RiderResponse> assigned() {
        return riderService.assigned().stream().map(riderService::toResponse).toList();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public RiderResponse get(@PathVariable UUID id) {
        return riderService.toResponse(riderService.findById(id));
    }

    private static RiderStatus parseStatus(String status) {
        return status == null || status.isBlank() || "ALL".equals(status)
                ? null : RiderStatus.valueOf(status);
    }

    private static VehicleState parseVehicleState(String state) {
        return state == null || state.isBlank() || "ALL".equals(state)
                ? null : VehicleState.valueOf(state);
    }
}