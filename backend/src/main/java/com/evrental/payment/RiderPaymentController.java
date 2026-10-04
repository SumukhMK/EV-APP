package com.evrental.payment;

import com.evrental.rider.RiderService;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A rider's payment history (screen 08's payment panel).
 *
 * <p>Gated SA/FA/FS, not SA/FA like the rest of the money module: this panel
 * lives on the rider profile, which is a Riders-section page (RBAC.md), and
 * FS-12 says fleet staff see a rider's payment history. The books themselves —
 * the run, the overdue list, the charge ledger — stay SA/FA.
 *
 * <p>It returned an empty list until S6's second half existed. It now returns
 * the rider's real payment_periods rows. An unknown rider is still a 404,
 * matching the mock; a rider with no billed week yet is an empty list, which
 * is the honest answer while generation is a side effect of opening the run
 * screen.
 */
@RestController
@RequestMapping("/api/v1/payments/riders/{riderId}/periods")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
public class RiderPaymentController {

    private final PaymentRunService runs;
    private final RiderService riderService;

    public RiderPaymentController(PaymentRunService runs, RiderService riderService) {
        this.runs = runs;
        this.riderService = riderService;
    }

    @GetMapping
    public List<RiderPaymentRow> periods(@PathVariable String riderId) {
        return runs.historyFor(riderService.findByRiderCode(riderId).getId());
    }
}
