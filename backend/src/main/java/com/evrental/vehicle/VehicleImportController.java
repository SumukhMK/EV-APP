package com.evrental.vehicle;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.UnauthorizedException;
import com.evrental.user.UserRepository;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/vehicles/imports")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
public class VehicleImportController {

    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final VehicleImportService vehicleImportService;
    private final VehicleImportTemplate template;
    private final UserRepository users;

    public VehicleImportController(VehicleImportService vehicleImportService,
                                   VehicleImportTemplate template,
                                   UserRepository users) {
        this.vehicleImportService = vehicleImportService;
        this.template = template;
        this.users = users;
    }

    /**
     * The blank Excel file to fill in. Built on each request from the same
     * header list the parser reads, so it cannot drift from what the upload
     * accepts.
     */
    @GetMapping("/template")
    public ResponseEntity<Resource> template() {
        byte[] workbook = template.workbook();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + VehicleImportTemplate.FILE_NAME + "\"")
                .contentType(MediaType.parseMediaType(XLSX))
                .contentLength(workbook.length)
                .body(new ByteArrayResource(workbook));
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
