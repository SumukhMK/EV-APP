package com.evrental.config;

import com.evrental.auth.JwtService;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * The chain, in the shape S0-auth fills in.
 *
 * <p>Deliberately closed: everything except the health probe, the CORS
 * preflight and the auth endpoints is denied. There is no permit-all fallback
 * and no default user, so this skeleton cannot be deployed accidentally open —
 * an endpoint added before its rule is added returns 401 rather than serving a
 * stranger.
 *
 * <p>Two filters sit in the chain: {@link JwtAuthenticationFilter} turns the
 * bearer token into an authenticated principal, and {@link TenantFilter} issues
 * {@code SET LOCAL app.tenant_id} so Postgres row-level security does the
 * actual isolation. Both are constructed here rather than declared as beans —
 * a {@code Filter} bean would also be auto-registered as a servlet filter and
 * run twice.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /** Vite dev server in local, the Netlify origin in deployed environments. */
    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Bean
    SecurityFilterChain filterChain(
            HttpSecurity http,
            JwtService jwtService,
            DataSource dataSource,
            PlatformTransactionManager txManager) throws Exception {
        JwtAuthenticationFilter jwtFilter = new JwtAuthenticationFilter(jwtService);
        TenantFilter tenantFilter = new TenantFilter(dataSource, txManager);
        http
                // No cookies, no sessions: the browser sends a bearer token, so
                // there is no CSRF vector to protect and nothing to store.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsSource()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                // The JWT filter runs before the authorization decision; the
                // TenantFilter runs after it, so it can read the principal, and
                // wraps the rest of the request in the tenant transaction.
                .addFilterBefore(jwtFilter, org.springframework.security.web.access.intercept.AuthorizationFilter.class)
                .addFilterAfter(tenantFilter, JwtAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers(
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/logout").permitAll()
                        .anyRequest().authenticated())
                // Without these, an anonymous caller gets a 403 with an empty
                // body — which tells the UI "you are signed in but not allowed"
                // when the truth is "you are not signed in". The distinction is
                // what decides whether the app redirects to login or shows a
                // denial, so it has to be right.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                writeError(response, HttpStatus.UNAUTHORIZED, "Not signed in"))
                        .accessDeniedHandler((request, response, deniedException) ->
                                writeError(response, HttpStatus.FORBIDDEN, "You do not have access to this")));
        return http.build();
    }

    /** BCrypt, per docs/architecture/ARCHITECTURE.md. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * A security failure leaves through the filter chain, before any controller
     * advice runs, so it cannot use GlobalExceptionHandler — but it must return
     * the same body shape, because the UI has one error parser and no special
     * case for the two statuses it sees most.
     */
    private static void writeError(HttpServletResponse response, HttpStatus status, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"message\":\"" + message + "\",\"status\":" + status.value() + "}");
    }

    private CorsConfigurationSource corsSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
