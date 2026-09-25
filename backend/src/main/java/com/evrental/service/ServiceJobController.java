package com.evrental.service;

import com.evrental.auth.JwtPrincipal;
import com.evrental.common.PageResponse;
import com.evrental.common.UnauthorizedException;
import com.evrental.user.User;
import com.evrental.user.UserRepository;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The assistance desk's endpoints.
 *
 * <p>Role rules come from docs/backend/RBAC.md and one of them is worth saying
 * out loud: <strong>a service manager cannot close a job.</strong> They run the
 * workshop, so they open, work, move and QC — but closing a job decides who
 * pays for it, and that is fleet and admin work. It is the one place in this
 * module where the workshop role is the narrower one.
 *
 * <p>Reading is open to all four roles. A fleet hand who cannot see why a bike
 * is off the road will ring someone who can, which is worse than letting them
 * read it.
 */
@RestController
@RequestMapping("/api/v1/service")
public class ServiceJobController {

    private static final int MAX_PAGE_SIZE = 100;

    private final ServiceJobService jobs;
    private final ServiceJobReader reader;
    private final UserRepository users;

    public ServiceJobController(ServiceJobService jobs, ServiceJobReader reader, UserRepository users) {
        this.jobs = jobs;
        this.reader = reader;
        this.users = users;
    }

    /**
     * The caller, as the activity log needs them. The JWT carries the user id
     * but deliberately not the name — a name inside a token goes stale — so it
     * is read fresh, under the caller's own tenant.
     */
    private String actorName(JwtPrincipal principal) {
        return users.findById(principal.userId())
                .map(User::getName)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));
    }

    @GetMapping("/jobs")
    public PageResponse<ServiceJobResponse> list(
            @RequestParam(required = false) ServiceJobStatus status,
            @RequestParam(required = false) ServiceQueue queue,
            @RequestParam(required = false) ServiceJobSource source,
            @RequestParam(required = false) String vehicleId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        // Newest first: the desk works the job that just arrived, not the one
        // that has been sitting in the queue longest.
        return reader.list(status, queue, source, vehicleId,
                PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE),
                        Sort.by(Sort.Direction.DESC, "createdOn")));
    }

    @GetMapping("/jobs/{id}")
    public ServiceJobResponse get(@PathVariable UUID id) {
        return reader.detail(id);
    }

    @PostMapping("/jobs")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public ServiceJobResponse open(@Valid @RequestBody CreateServiceJobRequest request,
                                   Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        ServiceJob job = jobs.open(request, principal.tenantId(), principal.userId(), actorName(principal));
        return reader.detail(job.getId());
    }

    @PutMapping("/jobs/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF','SERVICE_MANAGER')")
    public ServiceJobResponse update(@PathVariable UUID id,
                                     @Valid @RequestBody UpdateServiceJobRequest request,
                                     Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        jobs.update(id, request, principal.userId(), actorName(principal));
        return reader.detail(id);
    }

    /**
     * Closing decides liability, so the workshop role is deliberately absent —
     * RBAC.md conflict #2, ruled in favour of the approved service design.
     */
    @PostMapping("/jobs/{id}/close")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public ServiceJobResponse close(@PathVariable UUID id,
                                    @Valid @RequestBody CloseServiceJobRequest request,
                                    Authentication authentication) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        jobs.close(id, request, principal.userId(), actorName(principal));
        return reader.detail(id);
    }

    @GetMapping("/queues/counts")
    public java.util.List<QueueCountResponse> queueCounts() {
        return reader.queueCounts();
    }
}
