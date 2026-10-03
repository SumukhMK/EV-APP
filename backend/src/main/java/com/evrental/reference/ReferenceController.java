package com.evrental.reference;

import com.evrental.auth.JwtPrincipal;
import com.evrental.reference.ReferenceResponses.FormOptionsResponse;
import com.evrental.reference.ReferenceResponses.HubResponse;
import com.evrental.reference.ReferenceResponses.ModelResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The lists the vehicle and service forms offer.
 *
 * <p>Readable by every role that can open those forms. Adding is SA/FA: a new
 * hub is a change to how the fleet is organised, not a counter task.
 */
@RestController
@RequestMapping("/api/v1/reference")
public class ReferenceController {

    private final ReferenceService reference;

    public ReferenceController(ReferenceService reference) {
        this.reference = reference;
    }

    @GetMapping("/form-options")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public FormOptionsResponse formOptions() {
        return reference.formOptions();
    }

    @PostMapping("/hubs")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public HubResponse addHub(@Valid @RequestBody NameRequest request, Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return reference.addHub(principal.tenantId(), request.name());
    }

    @PostMapping("/models")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
    public ModelResponse addModel(@Valid @RequestBody ModelRequest request, Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return reference.addModel(principal.tenantId(), request.name(), request.make());
    }

    public record NameRequest(
            @NotBlank(message = "A name is required")
            @Size(max = 80, message = "A name must be at most 80 characters")
            String name) {}

    public record ModelRequest(
            @NotBlank(message = "A name is required")
            @Size(max = 60, message = "A name must be at most 60 characters")
            String name,
            @Size(max = 60, message = "A make must be at most 60 characters")
            String make) {}
}
