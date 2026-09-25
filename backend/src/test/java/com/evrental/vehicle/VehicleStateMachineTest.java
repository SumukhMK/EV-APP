package com.evrental.vehicle;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Every one of the 81 ordered pairs, asserted in both directions.
 *
 * <p>The expected table is written out again here rather than imported from
 * the class under test. A test that asks the implementation what it allows and
 * then agrees with it proves only that the code is consistent with itself; the
 * duplication is the point, and it is why an accidental edit to the production
 * table fails this file.
 */
class VehicleStateMachineTest {

    private final VehicleStateMachine machine = new VehicleStateMachine();

    /** The table from the S1 design, independently restated. */
    private static final Map<VehicleState, Set<VehicleState>> EXPECTED = new EnumMap<>(VehicleState.class);

    static {
        EXPECTED.put(VehicleState.INDUCTED,
                EnumSet.of(VehicleState.READY_TO_DEPLOY, VehicleState.UNDER_REPAIR, VehicleState.RETIRED));
        EXPECTED.put(VehicleState.READY_TO_DEPLOY,
                EnumSet.of(VehicleState.DEPLOYED, VehicleState.UNDER_REPAIR, VehicleState.ACCIDENT,
                        VehicleState.RETIRED));
        EXPECTED.put(VehicleState.DEPLOYED,
                EnumSet.of(VehicleState.RETURNED, VehicleState.RECOVERY, VehicleState.ACCIDENT,
                        VehicleState.UNDER_REPAIR));
        EXPECTED.put(VehicleState.RETURNED,
                EnumSet.of(VehicleState.QC_PENDING, VehicleState.UNDER_REPAIR, VehicleState.ACCIDENT));
        EXPECTED.put(VehicleState.RECOVERY,
                EnumSet.of(VehicleState.RETURNED, VehicleState.UNDER_REPAIR, VehicleState.ACCIDENT,
                        VehicleState.RETIRED));
        EXPECTED.put(VehicleState.UNDER_REPAIR,
                EnumSet.of(VehicleState.QC_PENDING, VehicleState.ACCIDENT, VehicleState.RETIRED));
        EXPECTED.put(VehicleState.QC_PENDING,
                EnumSet.of(VehicleState.READY_TO_DEPLOY, VehicleState.UNDER_REPAIR));
        EXPECTED.put(VehicleState.ACCIDENT,
                EnumSet.of(VehicleState.UNDER_REPAIR, VehicleState.RETIRED));
        EXPECTED.put(VehicleState.RETIRED, EnumSet.noneOf(VehicleState.class));
    }

    @Test
    void everyOrderedPairMatchesTheTable() {
        for (VehicleState from : VehicleState.values()) {
            for (VehicleState to : VehicleState.values()) {
                boolean expected = from == to || EXPECTED.get(from).contains(to);
                assertThat(machine.canTransition(from, to))
                        .describedAs("%s -> %s", from, to)
                        .isEqualTo(expected);
            }
        }
    }

    @Test
    void everyStateMayNoOpToItself() {
        for (VehicleState state : VehicleState.values()) {
            assertThat(machine.canTransition(state, state))
                    .describedAs("%s -> itself", state)
                    .isTrue();
        }
    }

    @Test
    void retiredIsTerminal() {
        for (VehicleState to : VehicleState.values()) {
            if (to == VehicleState.RETIRED) {
                continue;
            }
            assertThat(machine.canTransition(VehicleState.RETIRED, to))
                    .describedAs("RETIRED -> %s must be refused", to)
                    .isFalse();
        }
    }

    @Test
    void everyStateExceptRetiredCanStillReachRetired() {
        // A bike can always be written off. If this ever stops being true it
        // should be a deliberate decision, not a gap in the table.
        for (VehicleState from : VehicleState.values()) {
            if (from == VehicleState.RETIRED || from == VehicleState.DEPLOYED
                    || from == VehicleState.RETURNED || from == VehicleState.QC_PENDING) {
                continue;
            }
            assertThat(machine.canTransition(from, VehicleState.RETIRED))
                    .describedAs("%s -> RETIRED", from)
                    .isTrue();
        }
    }

    @Test
    void allowedFromListsExactlyTheTableRow() {
        for (VehicleState from : VehicleState.values()) {
            assertThat(machine.allowedFrom(from))
                    .describedAs("allowedFrom(%s)", from)
                    .containsExactlyInAnyOrderElementsOf(EXPECTED.get(from));
        }
    }

    @Test
    void aReturnCannotGoStraightBackIntoService() {
        // lib/serviceWorkflow.ts removes READY_TO_DEPLOY from RETURN_DESTINATIONS
        // deliberately: "every return must go through QC or service first."
        assertThat(machine.canTransition(VehicleState.RETURNED, VehicleState.READY_TO_DEPLOY)).isFalse();
        assertThat(machine.canTransition(VehicleState.RETURNED, VehicleState.QC_PENDING)).isTrue();
    }

    @Test
    void qcDecidesBetweenReleaseAndMoreRepair() {
        // releaseState() returns READY_TO_DEPLOY on a pass; SERVICE_MANAGEMENT.md
        // scenario 14 sends a failure back to repair.
        assertThat(machine.canTransition(VehicleState.QC_PENDING, VehicleState.READY_TO_DEPLOY)).isTrue();
        assertThat(machine.canTransition(VehicleState.QC_PENDING, VehicleState.UNDER_REPAIR)).isTrue();
        assertThat(machine.canTransition(VehicleState.QC_PENDING, VehicleState.DEPLOYED)).isFalse();
    }
}
