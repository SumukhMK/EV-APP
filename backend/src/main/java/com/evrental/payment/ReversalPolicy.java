package com.evrental.payment;

import com.evrental.user.UserRole;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Who may reverse a payment, and until when. One place, so the account screen
 * offers Reverse only to someone the server will let do it.
 *
 * <ul>
 *   <li>Fleet staff: only a payment they took themselves, the same day (IST),
 *       and only before its receipt was printed — after that it is an admin's call.</li>
 *   <li>Fleet admin: any payment up to 7 days old, receipt printed or not.</li>
 *   <li>Super admin: any age; past 7 days the reason has to say what happened.</li>
 * </ul>
 */
final class ReversalPolicy {

    static final Duration ADMIN_WINDOW = Duration.ofDays(7);
    /** Past the admin window the reason must explain itself, not just say "wrong". */
    static final int DETAILED_REASON_MIN = 20;

    private ReversalPolicy() {}

    /** {@code code} is null when allowed; otherwise why not, in words for the screen. */
    record Verdict(String code, String message, boolean needsDetailedReason) {
        boolean allowed() {
            return code == null;
        }

        static Verdict yes(boolean detailed) {
            return new Verdict(null, null, detailed);
        }

        static Verdict no(String code, String message) {
            return new Verdict(code, message, false);
        }
    }

    static Verdict check(PaymentCollection p, boolean alreadyReversed, UUID userId, UserRole role,
                         Instant now, LocalDate today) {
        if (p.isReversal()) {
            return Verdict.no("ALREADY_A_REVERSAL", "A reversal cannot be reversed; record the payment again instead.");
        }
        if (alreadyReversed) {
            return Verdict.no("ALREADY_REVERSED", "This payment was already reversed.");
        }
        boolean old = p.getCollectedOn().isBefore(now.minus(ADMIN_WINDOW));
        return switch (role) {
            case SUPER_ADMIN -> Verdict.yes(old);
            case FLEET_ADMIN -> old
                    ? Verdict.no("REVERSE_TOO_OLD", "More than 7 days old — only a super admin can reverse it.")
                    : Verdict.yes(false);
            case FLEET_STAFF -> {
                if (!userId.equals(p.getCollectedByUserId())) {
                    yield Verdict.no("REVERSE_NOT_YOURS", "Someone else took this payment — ask an admin to reverse it.");
                }
                if (!p.getCollectedOn().atZone(BillingClock.ZONE).toLocalDate().equals(today)) {
                    yield Verdict.no("REVERSE_DAY_CLOSED", "Taken on an earlier day — ask an admin to reverse it.");
                }
                if (p.getReceiptIssuedAt() != null) {
                    yield Verdict.no("RECEIPT_ISSUED", "The receipt has been printed — ask an admin to reverse it.");
                }
                yield Verdict.yes(false);
            }
            default -> Verdict.no("REVERSE_NOT_ALLOWED", "Your role cannot reverse payments.");
        };
    }
}
