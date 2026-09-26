package com.evrental.service;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The nine safety checks a bike must pass before it goes back to the fleet.
 *
 * <p>The ids are the ones the screen actually sends -- QC_CHECKS in
 * pages/service/AssistanceJob.tsx -- which means {@code roadtest}, not the
 * {@code road_test} the design document sketches. The screen is the thing that
 * will post the payload, so it wins; a backend that demanded the underscore
 * would reject every real submission and pass every test written from the
 * document.
 *
 * <p>All nine must be present and none other. A missing check is not a failed
 * check: it is a form that did not ask, and treating silence as a pass is how
 * a bike with untested brakes gets released.
 */
public final class QcChecks {

    public static final List<String> REQUIRED = List.of(
            "brakes", "tyres", "battery", "lights", "horn",
            "mirrors", "throttle", "frame", "roadtest");

    private static final Set<String> REQUIRED_SET = Set.copyOf(REQUIRED);

    private QcChecks() {
    }

    /** The checks that were asked for but not answered, in the canonical order. */
    public static List<String> missingFrom(Map<String, Boolean> checks) {
        if (checks == null) {
            return REQUIRED;
        }
        return REQUIRED.stream().filter(name -> checks.get(name) == null).toList();
    }

    /** Anything sent that is not one of the nine, sorted so the message is stable. */
    public static List<String> unknownIn(Map<String, Boolean> checks) {
        if (checks == null) {
            return List.of();
        }
        return checks.keySet().stream().filter(name -> !REQUIRED_SET.contains(name)).sorted().toList();
    }

    /** True only when every one of the nine is true. */
    public static boolean allPassed(Map<String, Boolean> checks) {
        return checks != null && REQUIRED.stream().allMatch(name -> Boolean.TRUE.equals(checks.get(name)));
    }
}
