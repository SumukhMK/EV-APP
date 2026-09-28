package com.evrental.payment;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * {@link AssignmentQuery} before S5 exists: nobody holds a bike.
 *
 * <p>Until then a run row carries a null vehicle and bills a full week, which
 * the design states as a known compromise rather than hiding behind a
 * plausible guess.
 *
 * <p><b>S5:</b> annotate the {@code assignment/} implementation
 * {@code @Primary} and it takes over — no edit to {@code payment/} and no
 * conversation about bean names. {@code @ConditionalOnMissingBean} is
 * deliberately not used here: Spring only evaluates it reliably inside
 * auto-configuration, and on an ordinary {@code @Component} it would silently
 * register both beans and fail the context with "expected single matching
 * bean" — a failure that only appears on the day S5 lands.
 */
@Component
public class NoAssignmentsYet implements AssignmentQuery {

    @Override
    public Optional<Window> openAssignmentFor(UUID riderId, LocalDate from, LocalDate to) {
        return Optional.empty();
    }
}
