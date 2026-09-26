package com.evrental.payment;

import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The charge ledger, read and settled.
 *
 * <p>Money is admin work: RBAC.md gives the Money section to SUPER_ADMIN and
 * FLEET_ADMIN only, and a fleet hand or a service manager never sees it. That
 * is stricter than the service endpoints on purpose — a workshop role can run
 * up a cost but must not be able to read the fleet's books or write a debt off.
 *
 * <p>Thin on purpose. The screens this will eventually serve — the weekly run,
 * the overdue list, receipts — are not here, because all three need the
 * rider's name, rent and billing day, and riders are S2.
 */
@RestController
@RequestMapping("/api/v1/payments/charges")
@PreAuthorize("hasAnyRole('SUPER_ADMIN','FLEET_ADMIN')")
public class RiderChargeController {

    private final RiderChargeService charges;

    public RiderChargeController(RiderChargeService charges) {
        this.charges = charges;
    }

    @GetMapping
    public List<RiderChargeResponse> forRider(@RequestParam UUID riderId,
                                              @RequestParam(required = false) RiderChargeStatus status) {
        return charges.forRider(riderId, status).stream().map(RiderChargeResponse::from).toList();
    }

    /** What this rider owes, in paise. The one number the collections desk asks for. */
    @GetMapping("/outstanding")
    public OutstandingResponse outstanding(@RequestParam UUID riderId) {
        return new OutstandingResponse(riderId, charges.outstandingPaiseFor(riderId));
    }

    @PostMapping("/{id}/settle")
    public RiderChargeResponse settle(@PathVariable UUID id) {
        return RiderChargeResponse.from(charges.settle(id));
    }

    public record OutstandingResponse(UUID riderId, long outstandingPaise) {
    }
}
