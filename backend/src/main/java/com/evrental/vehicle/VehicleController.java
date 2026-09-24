package com.evrental.vehicle;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.Facet;
import com.evrental.common.PageResponse;
import com.evrental.common.UnauthorizedException;
import com.evrental.user.UserRepository;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vehicle registry endpoints.
 *
 * <p>Every method carries its own role rule. The gate ships with S1 rather than
 * waiting for S3 because the machinery already exists -- UserRole, the ROLE_*
 * authority and @EnableMethodSecurity all landed in S0 -- and retrofitting
 * annotations across three stages of endpoints is how one gets missed.
 *
 * <p>SERVICE_MANAGER can read and transition but not create or edit: S4 is
 * their stage and a service queue that cannot move the bike it is servicing is
 * unusable. FLEET_STAFF can only read, until Ashok says what they actually do.
 */
@RestController
@RequestMapping("/api/v1/vehicles")
public class VehicleController {

    private final VehicleService vehicleService;
    private final UserRepository users;
    private final VehicleLifecycleEventRepository lifecycleEvents;

    public VehicleController(VehicleService vehicleService,
                             UserRepository users,
                             VehicleLifecycleEventRepository lifecycleEvents) {
        this.vehicleService = vehicleService;
        this.users = users;
        this.lifecycleEvents = lifecycleEvents;
    }

    /**
     * The caller, as the lifecycle log needs them. The JWT carries the user id
     * but deliberately not the name -- a name inside a token goes stale -- so
     * the name is read fresh, under the caller's tenant, which RLS permits
     * because it is their own row.
     */
    private String actorName(JwtPrincipal principal) {
        return users.findById(principal.userId())
                .map(com.evrental.user.User::getName)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN')")
    public VehicleResponse create(@Valid @RequestBody CreateVehicleRequest request,
                                  Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return VehicleResponse.from(
                vehicleService.create(request, principal.tenantId(), principal.userId(), actorName(principal)));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public PageResponse<VehicleResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String hub,
            @RequestParam(required = false) String make,
            @RequestParam(required = false) String batteryType) {
        VehicleQuery query = new VehicleQuery(q, parseState(state), hub, make, batteryType);
        return PageResponse.from(
                vehicleService.search(query, PageRequest.of(page, Math.min(size, 100), Sort.by("registryId"))),
                VehicleResponse::from);
    }

    @GetMapping("/facets")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public List<Facet<String>> facets(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String hub,
            @RequestParam(required = false) String make,
            @RequestParam(required = false) String batteryType) {
        return vehicleService.facets(new VehicleQuery(q, parseState(state), hub, make, batteryType));
    }

    @GetMapping("/filter-options")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public FilterOptionsResponse filterOptions() {
        return vehicleService.filterOptions();
    }

    @GetMapping("/{registryId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public VehicleDetailResponse get(@PathVariable String registryId) {
        return detailOf(vehicleService.findByRegistryId(registryId));
    }

    @PutMapping("/{registryId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN')")
    public VehicleDetailResponse update(@PathVariable String registryId,
                                        @Valid @RequestBody UpdateVehicleRequest request) {
        return detailOf(vehicleService.update(registryId, request));
    }

    @PostMapping("/{registryId}/transitions")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN','SERVICE_MANAGER')")
    public VehicleResponse transition(@PathVariable String registryId,
                                      @Valid @RequestBody TransitionRequest request,
                                      Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        Vehicle vehicle = vehicleService.findByRegistryId(registryId);
        return VehicleResponse.from(vehicleService.transitionState(
                vehicle.getId(), request.toState(), request.note(),
                principal.userId(), actorName(principal)));
    }

    /** A vehicle plus its history. assignments stays empty until S5 owns them. */
    private VehicleDetailResponse detailOf(Vehicle vehicle) {
        return VehicleDetailResponse.from(
                vehicle,
                lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicle.getId()));
    }

    private static VehicleState parseState(String state) {
        return state == null || state.isBlank() || "ALL".equals(state) ? null : VehicleState.valueOf(state);
    }
}
