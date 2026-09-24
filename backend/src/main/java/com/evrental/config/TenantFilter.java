package com.evrental.config;

import com.evrental.auth.JwtPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
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
 *       nothing to do but not fail it.</li>
 * </ul>
 */
public class TenantFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TenantFilter.class);

    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    public TenantFilter(DataSource dataSource, PlatformTransactionManager txManager) {
        this.tx = new TransactionTemplate(txManager);
        this.jdbc = new JdbcTemplate(dataSource);
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
            log.debug("Request transaction rolled back after a handled business exception", e);
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