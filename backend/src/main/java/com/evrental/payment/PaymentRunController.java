package com.evrental.payment;

import com.evrental.auth.JwtPrincipal;
import com.evrental.rider.BillingDay;
import com.evrental.rider.RiderService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.node.NullNode;

/**
 * The weekly run, the overdue list, receipts and collections — screens 15, 16
 * and 17.
 *
 * <p>These four mirror {@code lib/api/payments.ts} one for one —
 * {@code getCurrentPaymentRun}, {@code listOverdueRiders},
 * {@code getPaymentReceipt}, {@code recordPayment} — so the frontend swap is a
 * re-export rather than a rewrite.
 *
 * <p>SUPER_ADMIN and FLEET_ADMIN only. RBAC.md's Money section is explicit:
 * "FS and SM never see the section". The one exception is the rider profile's
 * history panel, which lives in {@link RiderPaymentController} and is gated
 * SA/FA/FS for that reason.
 */
@RestController
@RequestMapping("/api/v1/payments")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
public class PaymentRunController {

    private final PaymentRunService runs;
    private final RiderService riderService;

    public PaymentRunController(PaymentRunService runs, RiderService riderService) {
        this.runs = runs;
        this.riderService = riderService;
    }

    /**
     * This week's run for one cycle. Generates the rows if nobody has yet —
     * see PaymentRunService for why generation is a side effect of a read.
     *
     * <p>Defaults to MONDAY, matching the contract's default argument.
     */
    @GetMapping("/runs/current")
    public PaymentRunResponse currentRun(Authentication authentication,
                                         @RequestParam(defaultValue = "MONDAY") BillingDay billingDay) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return runs.currentRun(principal.tenantId(), billingDay);
    }

    @GetMapping("/overdue")
    public List<OverdueRiderResponse> overdue() {
        return runs.overdue();
    }

    /**
     * One rider's receipt for the current period.
     *
     * <p>A rider with no line in this period is <b>200 with a JSON null</b>,
     * not a 404: the screen renders "no line in this period", which is a
     * different state from "no such rider" (that one is the 404 thrown in the
     * service). The literal {@code NullNode} is deliberate — returning Java
     * null here would send an empty body instead, and {@code res.json()} on an
     * empty body throws rather than resolving to null.
     */
    @GetMapping("/receipts/{riderId}")
    public ResponseEntity<Object> receipt(@PathVariable String riderId) {
        PaymentReceiptResponse receipt = runs.receiptFor(riderService.findByRiderCode(riderId).getId());
        return ResponseEntity.ok(receipt == null ? NullNode.getInstance() : receipt);
    }

    /**
     * Records money taken at the counter.
     *
     * <p>Returns the updated run row so RecordPaymentDialog can close onto
     * fresh numbers without a refetch.
     */
    @PostMapping("/collections")
    public PaymentPeriodRowResponse record(Authentication authentication,
                                           @Valid @RequestBody RecordPaymentRequest request) {
        JwtPrincipal principal = (JwtPrincipal) authentication.getPrincipal();
        return runs.record(principal.tenantId(), principal.userId(), request);
    }
}
