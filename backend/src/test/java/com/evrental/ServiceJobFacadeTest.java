package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.service.DamageCategory;
import com.evrental.service.ServiceJob;
import com.evrental.service.ServiceJobFacade;
import com.evrental.service.ServiceJobSource;
import com.evrental.service.ServiceJobStatus;
import com.evrental.service.ServiceQueue;
import com.evrental.vehicle.VehicleState;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The one method S5 calls.
 *
 * <p>Tested through the interface rather than the implementation on purpose:
 * this is the whole contract between two people's code (WORK_SPLIT.md), so the
 * test should fail if the signature drifts, not quietly follow it.
 */
class ServiceJobFacadeTest extends ServiceJobTestBase {

    @Autowired
    ServiceJobFacade facade;

    @Test
    void opensAJobAndMovesTheBikeInOneCall() {
        ServiceJob job = asTenant(() -> facade.openJob(
                TENANT, "BLRSS0428", null, ServiceJobSource.DEBOARD,
                DamageCategory.MINOR, "Bent brake lever", "Dhananjay"));

        assertThat(job.getQueue()).isEqualTo(ServiceQueue.MINOR_REPAIR);
        assertThat(job.getStatus()).isEqualTo(ServiceJobStatus.OPEN);
        assertThat(job.getVehicleId()).isEqualTo(vehicleId);
        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.UNDER_REPAIR);
    }

    @Test
    void carriesTheRiderThroughSoTheChargeCanFindThem() {
        UUID riderId = UUID.randomUUID();

        ServiceJob job = asTenant(() -> facade.openJob(
                TENANT, "BLRSS0428", riderId, ServiceJobSource.DEBOARD,
                DamageCategory.MAJOR, "Cracked panel", "Dhananjay"));

        assertThat(job.getRiderId()).isEqualTo(riderId);
        assertThat(job.getQueue()).isEqualTo(ServiceQueue.MAJOR_REPAIR);
    }

    @Test
    void anUndamagedReturnGoesStraightToTheQcBench() {
        ServiceJob job = asTenant(() -> facade.openJob(
                TENANT, "BLRSS0428", null, ServiceJobSource.EXCHANGE,
                DamageCategory.NONE, null, "Dhananjay"));

        assertThat(job.getQueue()).isEqualTo(ServiceQueue.QC_PENDING);
        assertThat(stateOf(vehicleId)).isEqualTo(VehicleState.QC_PENDING);
    }

    @Test
    void refusesASecondJobOnABikeThatIsAlreadyIn() {
        asTenant(() -> facade.openJob(
                TENANT, "BLRSS0428", null, ServiceJobSource.DEBOARD,
                DamageCategory.MINOR, null, "Dhananjay"));

        assertThatThrownBy(() -> asTenant(() -> facade.openJob(
                TENANT, "BLRSS0428", null, ServiceJobSource.EXCHANGE,
                DamageCategory.MINOR, null, "Dhananjay")))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This bike already has an open service job");
    }

    @Test
    void refusesABikeThisTenantDoesNotHave() {
        insertVehicle(OTHER_TENANT, "RIVAL0007", "RIVALCHASSIS7", VehicleState.DEPLOYED);

        assertThatThrownBy(() -> asTenant(() -> facade.openJob(
                TENANT, "RIVAL0007", null, ServiceJobSource.DEBOARD,
                DamageCategory.MINOR, null, "Dhananjay")))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void writesTheCallersNameIntoTheLogRatherThanAServiceAccount() {
        ServiceJob job = asTenant(() -> facade.openJob(
                TENANT, "BLRSS0428", null, ServiceJobSource.RSA,
                DamageCategory.MAJOR, "Picked up on Sarjapur Road", "Dhananjay"));

        String actor = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT actor FROM service_job_events WHERE job_id = ?", String.class, job.getId()));
        assertThat(actor).isEqualTo("Dhananjay");
    }
}
