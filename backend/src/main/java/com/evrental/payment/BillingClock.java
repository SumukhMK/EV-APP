package com.evrental.payment;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.stereotype.Component;

/**
 * What "today" means to the money module.
 *
 * <p>Every date in a billing run is an Indian calendar date. The API runs on
 * Render, whose containers are UTC, so {@code LocalDate.now()} rolls over at
 * 05:30 IST — a payment collected at 01:00 on Monday would be stamped to
 * Sunday, land in the previous week, and pay off a period the rider had
 * already settled. Fixing that at each call site is a rule somebody forgets,
 * so the zone lives here and nothing in {@code payment/} calls
 * {@code LocalDate.now()} directly.
 *
 * <p>V009's backfill makes the same choice with {@code AT TIME ZONE
 * 'Asia/Kolkata'}; the two have to agree or a charge and its run row disagree
 * about which week they are in.
 *
 * <p>It is a bean rather than a constant so a test can freeze it.
 */
@Component
public class BillingClock {

    /** Ashok's operation bills in IST. Nothing about this is configurable. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private final Clock clock;

    public BillingClock() {
        this(Clock.system(ZONE));
    }

    public BillingClock(Clock clock) {
        this.clock = clock;
    }

    public LocalDate today() {
        return LocalDate.now(clock);
    }
}
