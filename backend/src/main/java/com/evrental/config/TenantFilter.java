package com.evrental.config;

import com.evrental.auth.JwtPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The isolation boundary: reads the {@code tenant_id} from the authenticated
 * principal and issues {@code SET LOCAL app.tenant_id} so Postgres row-level
 * security does the actual filtering (docs/architecture/ARCHITECTURE.md).
 *
 * <p>{@code SET LOCAL} only lives inside a transaction, so this filter opens
 * one around the rest of the request; service {@code @Transactional} methods
 * join it (REQUIRED) and therefore run under the tenant. Unauthenticated
 * requests set an empty tenant, which RLS treats as "see nothing" — the safe
 * default. The auth endpoints override it with the {@code '*'} sentinel in
 * their own REQUIRES_NEW transactions.
 *
 * <p>Two deliberate swallows:
 * <ul>
 *   <li>a business exception (404/409/422/401) thrown inside the request is
 *       answered by GlobalExceptionHandler, which writes the response before
 *       the exception reaches this filter — so the transaction commits
 *       normally, and the response is already on the wire;</li>
 *   <li>when a service marked the joined transaction rollback-only, the commit
 *       here throws {@link UnexpectedRollbackException} — the rollback is
 *       exactly what we want, and the response is already written, so there is
 *       nothing to do but log it and not fail it. Logged at WARN, because the
 *       same catch would otherwise hide a 2xx returned for work that was
 *       rolled back.</li>
 * </ul>
 */
public class TenantFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TenantFilter.class);

    /** Kept in step with the permitAll list in {@link SecurityConfig}. */
    private static final Set<String> AUTH_PATHS_WITHOUT_TENANT = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout");

    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    public TenantFilter(DataSource dataSource, PlatformTransactionManager txManager) {
        this.tx = new TransactionTemplate(txManager);
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /**
     * The three auth endpoints are skipped entirely, and that is a capacity
     * decision, not a tidiness one.
     *
     * <p>This filter holds one pooled connection for the whole request. The
     * auth endpoints then run their work in a {@code REQUIRES_NEW} transaction,
     * which <em>suspends</em> the outer one without giving its connection back
     * and takes a second. So every login in flight occupies two of the ten
     * connections in the pool, and ten concurrent logins hold ten outer
     * connections while all ten wait for an inner one that can never be freed
     * — a self-deadlock that resolves only when Hikari's 30s timeout fires on
     * each of them. Degradation starts at about five.
     *
     * <p>Skipping them costs nothing: none of the three reads tenant-scoped
     * data, and all three set the {@code '*'} sentinel on their own
     * transaction. {@code /api/v1/auth/me} is deliberately not in this list —
     * it reads the caller's own row under their tenant and needs this filter.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return AUTH_PATHS_WITHOUT_TENANT.contains(path);
    }

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        // The /error dispatch after an unhandled exception has no business
        // touching the database; GlobalExceptionHandler writes the body.
        return true;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String tenant = tenantFrom(SecurityContextHolder.getContext().getAuthentication());
        try {
            tx.executeWithoutResult(status -> {
                // set_config returns the new value, so this is a query, not an update.
                jdbc.queryForObject("SELECT set_config('app.tenant_id', ?, true)", String.class, tenant);
                try {
                    chain.doFilter(request, response);
                } catch (IOException | ServletException e) {
                    throw new FilterChainException(e);
                }
            });
        } catch (FilterChainException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IOException io) {
                throw io;
            }
            if (cause instanceof ServletException se) {
                throw se;
            }
            throw new ServletException(cause);
        } catch (UnexpectedRollbackException e) {
            // WARN, not DEBUG. For the documented case — a business exception
            // already answered by GlobalExceptionHandler — this line is noise.
            // But the same catch also covers a service that marked the
            // transaction rollback-only and still returned 2xx, which sends the
            // client a 201 for a row that does not exist. That must not be
            // findable only by turning on debug logging after someone notices.
            log.warn("Request transaction for {} {} rolled back; response status was {}",
                    request.getMethod(), request.getRequestURI(), response.getStatus(), e);
        }
    }

    private static String tenantFrom(Authentication authentication) {
        if (authentication != null
                && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof JwtPrincipal principal) {
            return principal.tenantId().toString();
        }
        return "";
    }

    /** Carries a checked exception out of the TransactionTemplate callback. */
    private static final class FilterChainException extends RuntimeException {
        FilterChainException(Throwable cause) {
            super(cause);
        }
    }
}