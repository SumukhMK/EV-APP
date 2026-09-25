package com.evrental.user;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.PageResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The account directory (screen 18): who can use the system and what each role
 * may do.
 *
 * <p>Both endpoints are admin-only. The account directory is not something
 * fleet staff or service managers see — the same rule that will later keep
 * staff off the payments screens. The role gate is the S0 machinery
 * ({@code ROLE_*} authority + {@code @EnableMethodSecurity}) that S1 already
 * uses on every vehicle endpoint.
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public PageResponse<UserResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return userService.list(PageRequest.of(page, Math.min(size, 100), Sort.by("name")));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public UserResponse update(@PathVariable UUID id,
                               @Valid @RequestBody UpdateUserRequest request,
                               Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return userService.update(id, request, principal.userId(), principal.role());
    }
}