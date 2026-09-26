package com.evrental.payment;

import com.evrental.rider.RiderService;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A rider's payment history (screen 08's payment panel).
 *
 * <p>Gated SA/FA/FS, not SA/FA like the charge ledger: this panel lives on the
 * rider profile, which is a Riders-section page (RBAC.md), and FS-12 says
 * fleet staff see a rider's payment history. The ledger itself stays SA/FA —
 * that is the books; this is the profile.
 *
 * <p>Returns an empty list until S6's second half computes real periods. The
 * rider is looked up so an unknown id is a 404, matching the mock.
 */
@RestController
@RequestMapping("/api/v1/payments/riders/{riderId}/periods")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN','FLEET_STAFF')")
public class RiderPaymentController {

    private final RiderService riders;

    public RiderPaymentController(RiderService riders) {
        this.riders = riders;
    }

    @GetMapping
    public List<RiderPaymentRow> periods(@PathVariable UUID riderId) {
        riders.findById(riderId); // 404 for an unknown rider, like the mock
        return List.of();
    }
}