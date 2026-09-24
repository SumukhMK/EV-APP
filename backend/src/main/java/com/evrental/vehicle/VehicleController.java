package com.evrental.vehicle;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.UnauthorizedException;
import com.evrental.user.UserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/vehicles")
public class VehicleController {

    private final VehicleService vehicleService;
    private final UserRepository users;

    public VehicleController(VehicleService vehicleService, UserRepository users) {
        this.vehicleService = vehicleService;
        this.users = users;
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
    public VehicleResponse create(@Valid @RequestBody CreateVehicleRequest request,
                                  Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return VehicleResponse.from(
                vehicleService.create(request, principal.tenantId(), principal.userId(), actorName(principal)));
    }
}
