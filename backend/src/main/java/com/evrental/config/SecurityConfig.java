package com.evrental.config;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
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
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * The chain, in the shape S0-auth will fill in.
 *
 * <p>Deliberately closed: everything except the health probe, the CORS
 * preflight and the (not yet written) auth endpoints is denied. There is no
 * permit-all fallback and no default user, so this skeleton cannot be deployed
 * accidentally open — an endpoint added before its rule is added returns 401
 * rather than serving a stranger.
 *
 * <p>Still to come in S0: the JWT filter that reads the {@code tenant_id} and
 * {@code role} claims, and the TenantFilter that issues
 * {@code SET LOCAL app.tenant_id} so Postgres row-level security can do the
 * actual isolation.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /** Vite dev server in local, the Netlify origin in deployed environments. */
    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // No cookies, no sessions: the browser sends a bearer token, so
                // there is no CSRF vector to protect and nothing to store.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsSource()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/api/v1/auth/login", "/api/v1/auth/refresh").permitAll()
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
