package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.evrental.common.ConflictException;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleLifecycleEvent;
import com.evrental.vehicle.VehicleLifecycleEventRepository;
import com.evrental.vehicle.VehicleState;
import com.evrental.vehicle.VehicleTransitions;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * transitionState() against a real Postgres -- the row lock is the point, and
 * a lock cannot be tested without a database that has one.
 */
class VehicleTransitionTest extends VehicleTestBase {

    @Autowired
    VehicleTransitions transitions;

    @Autowired
    VehicleLifecycleEventRepository lifecycleEvents;

    private UUID vehicleId;

    @BeforeEach
    void seedVehicle() {
        vehicleId = insertVehicle("BLRSS0500", "CH-500", VehicleState.READY_TO_DEPLOY);
    }

    @Test
    void aLegalMoveUpdatesTheStateAndLogsExactlyOneEvent() {
        Vehicle moved = asTenant(() ->
                transitions.transitionState(vehicleId, VehicleState.DEPLOYED, "Handed to rider",
                        adminUserId, "Meenakshi Iyer"));

        assertThat(moved.getState()).isEqualTo(VehicleState.DEPLOYED);

        List<VehicleLifecycleEvent> history = asTenant(() ->
                lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicleId));
        assertThat(history).hasSize(1);
        assertThat(history.get(0).getFromState()).isEqualTo(VehicleState.READY_TO_DEPLOY);
        assertThat(history.get(0).getToState()).isEqualTo(VehicleState.DEPLOYED);
        assertThat(history.get(0).getNote()).isEqualTo("Handed to rider");
        assertThat(history.get(0).getActorName()).isEqualTo("Meenakshi Iyer");
    }

    @Test
    void anIllegalMoveIsRefusedAndWritesNothing() {
        assertThatThrownBy(() -> asTenant(() ->
                transitions.transitionState(vehicleId, VehicleState.QC_PENDING, null,
                        adminUserId, "Meenakshi Iyer")))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Ready to Deploy")
                .hasMessageContaining("Quality Check");

        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.READY_TO_DEPLOY);
        assertThat(asTenant(() -> lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicleId))).isEmpty();
    }

    @Test
    void movingToTheSameStateIsANoOpAndLogsNothing() {
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.READY_TO_DEPLOY, "again",
                adminUserId, "Meenakshi Iyer"));

        assertThat(asTenant(() -> lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicleId))).isEmpty();
    }

    @Test
    void anUnknownVehicleIsNotFound() {
        assertThatThrownBy(() -> asTenant(() ->
                transitions.transitionState(UUID.randomUUID(), VehicleState.DEPLOYED, null,
                        adminUserId, "Meenakshi Iyer")))
                .isInstanceOf(com.evrental.common.NotFoundException.class);
    }

    @Test
    void historyReadsOldestFirst() {
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.DEPLOYED, null,
                adminUserId, "Meenakshi Iyer"));
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.RETURNED, null,
                adminUserId, "Meenakshi Iyer"));
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.QC_PENDING, null,
                adminUserId, "Meenakshi Iyer"));

        List<VehicleLifecycleEvent> history = asTenant(() ->
                lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicleId));
        assertThat(history).extracting(VehicleLifecycleEvent::getToState)
                .containsExactly(VehicleState.DEPLOYED, VehicleState.RETURNED, VehicleState.QC_PENDING);
    }

    @Test
    void theActorNameIsFrozenAtWriteTime() {
        asTenant(() -> transitions.transitionState(vehicleId, VehicleState.DEPLOYED, null,
                adminUserId, "Meenakshi Iyer"));

        renameUser(adminUserId, "Meenakshi Iyer-Rao");

        List<VehicleLifecycleEvent> history = asTenant(() ->
                lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicleId));
        // The history says who it was at the time, not who they are now.
        assertThat(history.get(0).getActorName()).isEqualTo("Meenakshi Iyer");
        assertThat(history.get(0).getActorUserId()).isEqualTo(adminUserId);
    }

    @Test
    void twoConcurrentTransitionsProduceExactlyOneWinner() throws Exception {
        CountDownLatch bothReady = new CountDownLatch(2);
        Callable<Boolean> attempt = () -> {
            bothReady.countDown();
            bothReady.await();
            try {
                asTenant(() -> transitions.transitionState(vehicleId, VehicleState.DEPLOYED, null,
                        adminUserId, "Meenakshi Iyer"));
                return true;
            } catch (RuntimeException refused) {
                return false;
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Boolean>> results = pool.invokeAll(List.of(attempt, attempt));
            long succeeded = results.stream().filter(f -> {
                try {
                    return f.get();
                } catch (Exception e) {
                    return false;
                }
            }).count();

            // One real move, one lifecycle row. Without FOR UPDATE both callers
            // read READY_TO_DEPLOY, both pass the check, and two rows are
            // written for one move.
            assertThat(succeeded).isEqualTo(2);
            assertThat(asTenant(() -> lifecycleEvents.findByVehicleIdOrderByOccurredOnAsc(vehicleId)))
                    .hasSize(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
