package com.evrental.vehicle;

import com.evrental.user.UserRole;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Which role may move a bike from one state to another.
 *
 * <p>The state machine ({@link VehicleStateMachine}) decides whether a move is
 * legal at all; this decides who is allowed to make it. The rules come from
 * the flow data (frontend/app/src/pages/admin/flows/flowData.ts), which is the
 * product intent: fleet roles run the day-to-day bike lifecycle (induct,
 * assign, return, recovery, accident report), every role works the workshop
 * (QC pass/fail, repair routing), and only fleet and admin roles retire a
 * bike. A service manager runs the workshop but does not induct, assign or
 * retire bikes; a fleet hand does not retire bikes.
 *
 * <p>A state may always move to itself -- the state machine treats that as a
 * no-op the caller writes nothing for, so no role is barred from it.
 *
 * <p>A Spring component with no dependencies and a no-argument constructor,
 * so it is injectable in production and {@code new VehicleTransitionPolicy()}
 * in a test.
 */
@Component
public class VehicleTransitionPolicy {

    /** Fleet lifecycle moves: induct, assign, return, recovery, accident report. */
    private static final Set<UserRole> FLEET = Set.of(
            UserRole.SUPER_ADMIN, UserRole.FLEET_ADMIN, UserRole.FLEET_STAFF);

    /** Workshop moves: QC pass/fail and repair routing. Open to every role. */
    private static final Set<UserRole> WORKSHOP = Set.of(
            UserRole.SUPER_ADMIN, UserRole.FLEET_ADMIN, UserRole.FLEET_STAFF, UserRole.SERVICE_MANAGER);

    /** Retirement is a fleet-and-admin decision, never a workshop one. */
    private static final Set<UserRole> ADMIN = Set.of(
            UserRole.SUPER_ADMIN, UserRole.FLEET_ADMIN);

    private static final Map<VehicleState, Map<VehicleState, Set<UserRole>>> ALLOWED;

    static {
        Map<VehicleState, Map<VehicleState, Set<UserRole>>> allowed = new EnumMap<>(VehicleState.class);

        allowed.put(VehicleState.INDUCTED, Map.of(
                VehicleState.READY_TO_DEPLOY, FLEET,
                VehicleState.UNDER_REPAIR, FLEET,
                VehicleState.RETIRED, ADMIN));

        allowed.put(VehicleState.READY_TO_DEPLOY, Map.of(
                VehicleState.DEPLOYED, FLEET,
                VehicleState.UNDER_REPAIR, FLEET,
                VehicleState.ACCIDENT, FLEET,
                VehicleState.RETIRED, ADMIN));

        allowed.put(VehicleState.DEPLOYED, Map.of(
                VehicleState.RETURNED, FLEET,
                VehicleState.RECOVERY, FLEET,
                VehicleState.ACCIDENT, FLEET,
                VehicleState.UNDER_REPAIR, FLEET));

        allowed.put(VehicleState.RETURNED, Map.of(
                VehicleState.QC_PENDING, FLEET,
                VehicleState.UNDER_REPAIR, FLEET,
                VehicleState.ACCIDENT, FLEET));

        allowed.put(VehicleState.RECOVERY, Map.of(
                VehicleState.RETURNED, FLEET,
                VehicleState.UNDER_REPAIR, FLEET,
                VehicleState.ACCIDENT, FLEET,
                VehicleState.RETIRED, ADMIN));

        allowed.put(VehicleState.UNDER_REPAIR, Map.of(
                VehicleState.QC_PENDING, WORKSHOP,
                VehicleState.ACCIDENT, WORKSHOP,
                VehicleState.RETIRED, ADMIN));

        allowed.put(VehicleState.QC_PENDING, Map.of(
                VehicleState.READY_TO_DEPLOY, WORKSHOP,
                VehicleState.UNDER_REPAIR, WORKSHOP));

        allowed.put(VehicleState.ACCIDENT, Map.of(
                VehicleState.UNDER_REPAIR, WORKSHOP,
                VehicleState.RETIRED, ADMIN));

        allowed.put(VehicleState.RETIRED, Map.of());

        ALLOWED = Collections.unmodifiableMap(allowed);
    }

    public boolean canTransition(UserRole role, VehicleState from, VehicleState to) {
        if (from == to) {
            return true;
        }
        Set<UserRole> roles = ALLOWED.getOrDefault(from, Map.of()).get(to);
        // A pair the state machine forbids is not in the table. No role may
        // make it, but the state machine's 409 is the more informative answer,
        // so the policy defers and lets the service reject the move.
        if (roles == null) {
            return true;
        }
        return roles.contains(role);
    }
}