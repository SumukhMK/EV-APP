package com.evrental.rider;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * What the money module says about a rider's standing. Implemented by
 * {@code payment/}.
 *
 * <p>Declared here rather than in {@code payment/} for the same reason
 * {@code payment.AssignmentQuery} is declared in {@code payment/}: the
 * consumer states what it needs, the owner satisfies it. The register knows
 * it has to colour a chip; it does not know how a billing period becomes a
 * status, and should not.
 *
 * <p>Before this existed, {@code RiderResponse} wrote the string "PENDING"
 * into every rider it returned. A profile therefore showed Pending above a
 * payment history showing Paid, and the list coloured every chip identically.
 *
 * <p>Batched on purpose. The register's list screen renders a page of riders,
 * and a status read per row is a query per row.
 */
public interface RiderPaymentStatusQuery {

    /**
     * The current standing of each rider, keyed by id.
     *
     * <p>A rider with no billing history is absent from the map rather than
     * present with a guess — never billed is not the same as owing, and the
     * caller decides what to show for it.
     */
    Map<UUID, String> statusFor(Collection<UUID> riderIds);

    /**
     * What each rider owes right now, in paise: unpaid rent on every period
     * plus every open charge. A rider who owes nothing is absent from the
     * map, so callers read it with {@code getOrDefault(id, 0L)}.
     */
    Map<UUID, Long> owedPaiseFor(Collection<UUID> riderIds);
}
