package com.evrental.vehicle;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Which state a bike may move to from where.
 *
 * <p>This table did not exist anywhere before S1. types/vehicle.ts points at an
 * `allowedTransitions` that was never written and SERVICE_MANAGEMENT.md
 * describes individual scenarios but no table, so the rules here are derived
 * from lib/serviceWorkflow.ts, the service design doc and the screens. This
 * class is now the single authority: nothing else in the codebase decides
 * whether a move is legal.
 *
 * <p>Three edges are open questions for Ashok and are permitted here because
 * forbidding a real operation is worse than permitting an unreal one:
 * DEPLOYED -> UNDER_REPAIR (roadside repair with no recorded return),
 * RECOVERY -> RETURNED (or straight to repair), and INDUCTED -> UNDER_REPAIR
 * (a bike that arrives broken).
 *
 * <p>A Spring component with no dependencies and a no-argument constructor, so
 * it is injectable in production and `new VehicleStateMachine()` in a test --
 * which is why the 81-pair test needs neither Spring nor Postgres.
 */
@Component
public class VehicleStateMachine {

    private static final Map<VehicleState, Set<VehicleState>> ALLOWED;

    static {
        Map<VehicleState, Set<VehicleState>> allowed = new EnumMap<>(VehicleState.class);

        allowed.put(VehicleState.INDUCTED, EnumSet.of(
                VehicleState.READY_TO_DEPLOY,
                VehicleState.UNDER_REPAIR,
                VehicleState.RETIRED));

        allowed.put(VehicleState.READY_TO_DEPLOY, EnumSet.of(
                VehicleState.DEPLOYED,
                VehicleState.UNDER_REPAIR,
                VehicleState.ACCIDENT,
                VehicleState.RETIRED));

        allowed.put(VehicleState.DEPLOYED, EnumSet.of(
                VehicleState.RETURNED,
                VehicleState.RECOVERY,
                VehicleState.ACCIDENT,
                VehicleState.UNDER_REPAIR));

        // READY_TO_DEPLOY is absent on purpose. lib/serviceWorkflow.ts:
        // "every return must go through QC or service first."
        allowed.put(VehicleState.RETURNED, EnumSet.of(
                VehicleState.QC_PENDING,
                VehicleState.UNDER_REPAIR,
                VehicleState.ACCIDENT));

        allowed.put(VehicleState.RECOVERY, EnumSet.of(
                VehicleState.RETURNED,
                VehicleState.UNDER_REPAIR,
                VehicleState.ACCIDENT,
                VehicleState.RETIRED));

        allowed.put(VehicleState.UNDER_REPAIR, EnumSet.of(
                VehicleState.QC_PENDING,
                VehicleState.ACCIDENT,
                VehicleState.RETIRED));

        // Pass releases, failure returns to repair (SERVICE_MANAGEMENT.md 11, 14).
        allowed.put(VehicleState.QC_PENDING, EnumSet.of(
                VehicleState.READY_TO_DEPLOY,
                VehicleState.UNDER_REPAIR));

        allowed.put(VehicleState.ACCIDENT, EnumSet.of(
                VehicleState.UNDER_REPAIR,
                VehicleState.RETIRED));

        allowed.put(VehicleState.RETIRED, EnumSet.noneOf(VehicleState.class));

        ALLOWED = Collections.unmodifiableMap(allowed);
    }

    /**
     * A state may always move to itself. That is a no-op the caller handles by
     * writing nothing -- screens fire idempotent saves and should not be
     * punished for it.
     */
    public boolean canTransition(VehicleState from, VehicleState to) {
        if (from == to) {
            return true;
        }
        return ALLOWED.getOrDefault(from, Set.of()).contains(to);
    }

    /** The row of the table, for a caller that wants to offer the choices. */
    public Set<VehicleState> allowedFrom(VehicleState state) {
        return Collections.unmodifiableSet(ALLOWED.getOrDefault(state, Set.of()));
    }
}
