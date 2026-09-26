package com.evrental.service;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.UnauthorizedException;
import com.evrental.user.User;
import com.evrental.user.UserRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The QC gate.
 *
 * <p>Separate from {@link ServiceJobController} because it is a different job:
 * that one moves work through queues, this one decides whether a bike is safe
 * to put back under a rider. All four roles may submit one — the workshop does
 * the checking, and a fleet hand releasing a bike after a minor fix is doing
 * the same nine checks.
 *
 * <p>History is a list, not a flag: a bike can fail, be reworked and be
 * inspected again, and the attempt that failed is the one worth reading later.
 */
@RestController
@RequestMapping("/api/v1/service/jobs/{id}/qc")
public class QcInspectionController {

    private final ServiceJobService jobs;
    private final ServiceJobReader reader;
    private final UserRepository users;

    public QcInspectionController(ServiceJobService jobs, ServiceJobReader reader, UserRepository users) {
        this.jobs = jobs;
        this.reader = reader;
        this.users = users;
    }

    private String actorName(JwtPrincipal principal) {
        return users.findById(principal.userId())
                .map(User::getName)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public QcInspectionResponse submit(@PathVariable UUID id,
                                       @Valid @RequestBody SubmitQcRequest request,
                                       Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return QcInspectionResponse.from(
                jobs.submitQc(id, request, principal.userId(), actorName(principal)));
    }

    @GetMapping
    public List<QcInspectionResponse> history(@PathVariable UUID id) {
        return reader.qcHistory(id);
    }
}
