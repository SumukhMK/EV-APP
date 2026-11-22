package com.evrental.payment;

import com.evrental.auth.JwtPrincipal;
import com.evrental.payment.CollectionResponses.Account;
import com.evrental.payment.CollectionResponses.Collections;
import com.evrental.payment.CollectionResponses.Payment;
import com.evrental.payment.CollectionResponses.Today;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The money screens: Collections, a rider's account, payments, reversals and
 * the end-of-day count. Mirrors {@code lib/api/payments.ts}.
 *
 * <p>SUPER_ADMIN and FLEET_ADMIN only (RBAC.md, Money). The one exception is a
 * rider's account, which the rider profile shows to fleet staff too.
 */
@RestController
@RequestMapping("/api/v1/payments")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
public class PaymentRunController {

    private final PaymentRunService payments;
    private final BillingClock clock;

    public PaymentRunController(PaymentRunService payments, BillingClock clock) {
        this.payments = payments;
        this.clock = clock;
    }

    @GetMapping("/collections")
    public Collections collections(Authentication authentication) {
        return payments.collections(principal(authentication).tenantId());
    }

    @GetMapping("/riders/{riderId}/account")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
    public Account account(@PathVariable String riderId) {
        return payments.account(riderId);
    }

    /** Records money taken. Returns the payment, which is also its receipt. */
    @PostMapping("/collections")
    public Payment record(Authentication authentication, @Valid @RequestBody RecordPaymentRequest request) {
        JwtPrincipal principal = principal(authentication);
        return payments.record(principal.tenantId(), principal.userId(), request);
    }

    @GetMapping("/collections/{paymentId}")
    public Payment payment(@PathVariable UUID paymentId) {
        return payments.payment(paymentId);
    }

    @PostMapping("/collections/{paymentId}/reverse")
    public Payment reverse(Authentication authentication, @PathVariable UUID paymentId,
                           @Valid @RequestBody ReversePaymentRequest request) {
        return payments.reverse(principal(authentication).userId(), paymentId, request);
    }

    @GetMapping("/today")
    public Today today(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return payments.today(date == null ? clock.today() : date);
    }

    private static JwtPrincipal principal(Authentication authentication) {
        return (JwtPrincipal) authentication.getPrincipal();
    }
}
