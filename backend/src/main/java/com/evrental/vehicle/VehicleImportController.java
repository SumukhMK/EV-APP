package com.evrental.vehicle;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.UnauthorizedException;
import com.evrental.user.UserRepository;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/vehicles/imports")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN')")
public class VehicleImportController {

    private final VehicleImportService vehicleImportService;
    private final UserRepository users;

    public VehicleImportController(VehicleImportService vehicleImportService, UserRepository users) {
        this.vehicleImportService = vehicleImportService;
        this.users = users;
    }

    @PostMapping
    public BulkUploadPreviewResponse preview(@RequestParam("file") MultipartFile file,
                                             Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return vehicleImportService.preview(file, principal.tenantId(), principal.userId());
    }

    @PostMapping("/{importId}/commit")
    public ImportResultResponse commit(@PathVariable UUID importId, Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return vehicleImportService.commit(importId, principal.tenantId(), principal.userId(), actorName(principal));
    }

    private String actorName(JwtPrincipal principal) {
        return users.findById(principal.userId())
                .map(com.evrental.user.User::getName)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));
    }
}
