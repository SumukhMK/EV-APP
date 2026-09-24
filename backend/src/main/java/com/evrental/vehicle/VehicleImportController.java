package com.evrental.vehicle;

import com.evrental.auth.JwtPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/vehicles/imports")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','TENANT_ADMIN')")
public class VehicleImportController {

    private final VehicleImportService vehicleImportService;

    public VehicleImportController(VehicleImportService vehicleImportService) {
        this.vehicleImportService = vehicleImportService;
    }

    @PostMapping
    public BulkUploadPreviewResponse preview(@RequestParam("file") MultipartFile file,
                                             Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return vehicleImportService.preview(file, principal.tenantId(), principal.userId());
    }
}
