package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Deboard: the gate — nothing else closes an assignment. The rider comes off
 * the active register, the settlement figures are recorded as facts on the
 * closing row, and the bike goes where its condition routes it.
 */
class AssignmentDeboardTest extends AssignmentTestBase {

    @Test
    void deboardsARider() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(RIDER_A_CODE))
                .andExpect(jsonPath("$.currentVehicleId").doesNotExist())
                .andExpect(jsonPath("$.status").value("DEBOARDED"));

        // The assignment is closed with the settlement facts; the rider is off
        // the active register; the undamaged bike went to QC; a job was opened.
        Integer closed = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM assignments
                WHERE tenant_id = ? AND rider_id = ? AND ended_on IS NOT NULL
                  AND reason = 'RETURNED' AND return_condition = 'NONE'
                  AND next_vehicle_state = 'QC_PENDING'
                  AND outstanding_rent_paise = 0 AND deposit_refund_paise = 300000
                  AND closed_by = 'Meenakshi Iyer'
                """, Integer.class, TENANT, RIDER_A));
        String riderStatus = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT status FROM riders WHERE id = ?
                """, String.class, RIDER_A));
        org.assertj.core.api.Assertions.assertThat(closed).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(riderStatus).isEqualTo("DEBOARDED");
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.QC_PENDING);
        org.assertj.core.api.Assertions.assertThat(hasOpenJob(VEHICLE_READY)).isTrue();
    }

    /** Same rule as the exchange: the return happened on a day inside the assignment, not before it or yet to come. */
    @Test
    void aReturnDatedOutsideTheAssignmentIs422OnTheDateField() throws Exception {
        assign(RIDER_A, VEHICLE_READY);  // started 2026-09-28

        for (String[] c : new String[][] {
                {"2026-09-01", "Return date cannot be before the assignment began"},
                {"2031-01-01", "Return date cannot be in the future"}}) {
            mvc.perform(post("/api/v1/assignments/deboard")
                            .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"riderId":"%s","vehicleId":"%s","returnedOn":"%s",
                                     "returnCondition":"NONE","reason":"RETURNED",
                                     "nextVehicleState":"QC_PENDING",
                                     "outstandingRent":0,"depositRefund":0,
                                     "damageItems":[]}
                                    """.formatted(RIDER_A_CODE, VEHICLE_READY, c[0])))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(jsonPath("$.field").value("returnedOn"))
                    .andExpect(jsonPath("$.message").value(c[1]));
        }
    }

    /** The register holds ₹3,000 for this rider; it cannot give back ₹3,000.01. */
    @Test
    void aDepositRefundAboveTheDepositHeldIs422OnTheRefundField() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":300001,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("depositRefund"))
                .andExpect(jsonPath("$.message").value("Deposit refund cannot be more than the deposit held"));
    }

    @Test
    void aRiderNotHoldingTheBikeIsA409() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_DEPLOYED)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Anil Shetty is not holding " + VEHICLE_DEPLOYED))
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    @Test
    void aDamagedReturnCreatesAJobAndRoutesTheBike() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"MINOR","reason":"SERVICE_ISSUE",
                                 "nextVehicleState":"UNDER_REPAIR",
                                 "outstandingRent":175000,"depositRefund":200000,
                                 "damageItems":[{"part":"Mirror","note":"cracked"}],
                                 "note":"mirror cracked on the way back"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk());

        // The BUILD.md done-when: a minor-damage deboard opens a job and the
        // bike lands on the repair bench, not in the yard.
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.UNDER_REPAIR);
        org.assertj.core.api.Assertions.assertThat(hasOpenJob(VEHICLE_READY)).isTrue();
        String source = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT source FROM service_jobs sj
                JOIN vehicles v ON v.id = sj.vehicle_id
                WHERE v.registry_id = ? AND sj.status = 'OPEN'
                """, String.class, VEHICLE_READY));
        org.assertj.core.api.Assertions.assertThat(source).isEqualTo("DEBOARD");
    }

    @Test
    void returnRulesAreEnforced() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        String token = tokenFor(ADMIN_EMAIL);

        // A destination outside the four a return may choose.
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"READY_TO_DEPLOY",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Choose a return destination"))
                .andExpect(jsonPath("$.field").value("nextVehicleState"));

        // A damaged return with no parts recorded.
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"MAJOR","reason":"RETURNED",
                                 "nextVehicleState":"UNDER_REPAIR",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(
                        "Record the damaged parts before returning this bike"))
                .andExpect(jsonPath("$.field").value("damageItems"));

        // An override of the condition's default destination needs a note.
        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"UNDER_REPAIR",
                                 "outstandingRent":0,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Explain the destination override"))
                .andExpect(jsonPath("$.field").value("note"));
    }

    @Test
    void negativeMoneyIsA422() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":-1,"depositRefund":300000,
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableEntity());
    }

    /**
     * "End assignment" from the job page of a check that is still open. It
     * used to be refused ("already has an open service job"); now the return
     * is written on that job and the bike stays where the workshop has it.
     */
    @Test
    void aRiderCanHandBackABikeThatIsAlreadyInTheWorkshop() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        String jobId = openCheck(VEHICLE_READY);
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.QC_PENDING);

        mvc.perform(post("/api/v1/assignments/deboard")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","returnedOn":"2026-09-28",
                                 "returnCondition":"NONE","reason":"RETURNED",
                                 "nextVehicleState":"QC_PENDING",
                                 "outstandingRent":0,"depositRefund":0,"damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DEBOARDED"))
                .andExpect(jsonPath("$.currentVehicleId").doesNotExist());

        // One job, not two; the bike stays on the bench; the return is on the job.
        Integer openJobs = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM service_jobs sj JOIN vehicles v ON v.id = sj.vehicle_id
                WHERE v.registry_id = ? AND sj.status <> 'CLOSED'
                """, Integer.class, VEHICLE_READY));
        org.assertj.core.api.Assertions.assertThat(openJobs).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.QC_PENDING);
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/v1/service/jobs/" + jobId)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.riderId").value(RIDER_A_CODE))
                .andReturn().getResponse().getContentAsString();
        java.util.List<String> notes = com.jayway.jsonpath.JsonPath.read(body, "$.activity[*].note");
        org.assertj.core.api.Assertions.assertThat(notes.get(notes.size() - 1))
                .startsWith("Rider handed the bike back while the bike was in the workshop — undamaged");
    }

    /** Opens a routine check on a held bike, as "Check this bike" does, and returns the job code. */
    private String openCheck(String registryId) throws Exception {
        String body = mvc.perform(post("/api/v1/service/jobs")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"vehicleId":"%s","source":"INSPECTION","damageCategory":"NONE","queue":"QC_PENDING"}
                                """.formatted(registryId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.id");
    }

    private void assign(UUID riderId, String vehicleId) throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(riderCode(riderId), vehicleId)))
                .andExpect(status().isOk());
    }
}