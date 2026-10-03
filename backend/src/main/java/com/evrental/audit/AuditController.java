package com.evrental.audit;

import com.evrental.common.PageResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Who did what, drawn from the records of the acts themselves.
 *
 * <p>SUPER_ADMIN and FLEET_ADMIN only. The trail names people and includes
 * money, and "who collected this and when" is an owner's question.
 *
 * <p>This replaces a frontend fixture of twelve hardcoded rows dated August
 * 2026, which rendered identically on an empty tenant and named real
 * colleagues. A fabricated compliance trail is the worst thing to be caught
 * with, because unlike an empty screen it is believed.
 */
@RestController
@RequestMapping("/api/v1/audit")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
public class AuditController {

    private final AuditService audit;

    public AuditController(AuditService audit) {
        this.audit = audit;
    }

    @GetMapping
    public PageResponse<AuditEventResponse> recent(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return audit.recent(page, size);
    }
}
