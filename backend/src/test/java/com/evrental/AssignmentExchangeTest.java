package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Exchange: two events, never an overwrite — the old assignment closes with a
 * condition and a new one opens. The bike coming back takes the same route a
 * deboarded bike does, so a swap cannot quietly put a damaged bike back in the
 * yard.
 */
class AssignmentExchangeTest extends AssignmentTestBase {

    @Test
    void exchangesABike() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(RIDER_A_CODE))
                .andExpect(jsonPath("$.currentVehicleId").value(VEHICLE_READY_2));

        // The old assignment is closed with the return facts; the new one is
        // open; the old bike went to QC (an undamaged return always does); the
        // new bike is out.
        Integer closed = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM assignments
                WHERE tenant_id = ? AND rider_id = ? AND ended_on IS NOT NULL
                  AND reason = 'RIDER_REQUEST' AND return_condition = 'NONE'
                  AND next_vehicle_state = 'QC_PENDING'
                """, Integer.class, TENANT, RIDER_A));
        Integer open = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM assignments
                WHERE tenant_id = ? AND rider_id = ? AND ended_on IS NULL
                """, Integer.class, TENANT, RIDER_A));
        org.assertj.core.api.Assertions.assertThat(closed).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(open).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.QC_PENDING);
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY_2))
                .isEqualTo(com.evrental.vehicle.VehicleState.DEPLOYED);
        // Every return opens a job — an undamaged one goes to QC.
        org.assertj.core.api.Assertions.assertThat(hasOpenJob(VEHICLE_READY)).isTrue();
    }

    /**
     * The swap is dated. A date before the rider ever had the bike, or one
     * that has not come yet, was accepted and became the new assignment's
     * start — so rent for the replacement started in the past or the future.
     */
    @Test
    void anExchangeDatedOutsideTheAssignmentIs422OnTheDateField() throws Exception {
        assign(RIDER_A, VEHICLE_READY);  // started 2026-09-28

        for (String[] c : new String[][] {
                {"2026-09-01", "Exchange date cannot be before the assignment began"},
                {"2031-01-01", "Exchange date cannot be in the future"}}) {
            mvc.perform(post("/api/v1/assignments/exchange")
                            .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                     "occurredOn":"%s","reason":"RIDER_REQUEST",
                                     "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                     "damageItems":[]}
                                    """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2, c[0])))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(jsonPath("$.field").value("occurredOn"))
                    .andExpect(jsonPath("$.message").value(c[1]));
        }
    }

    @Test
    void aRiderNotHoldingTheBikeIsA409() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_DEPLOYED, VEHICLE_READY_2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Anil Shetty is not holding " + VEHICLE_DEPLOYED))
                .andExpect(jsonPath("$.field").value("fromVehicleId"));
    }

    @Test
    void exchangingOntoTheSameBikeIsA409() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Pick a different bike to exchange onto"))
                .andExpect(jsonPath("$.field").value("toVehicleId"));
    }

    @Test
    void theToBikeMustBeReadyToDeploy() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_DEPLOYED)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(VEHICLE_DEPLOYED + " is not Ready to Deploy"))
                .andExpect(jsonPath("$.field").value("toVehicleId"));
    }

    @Test
    void aDamagedReturnRoutesTheBikeToRepair() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"BREAKDOWN",
                                 "returnCondition":"MINOR","nextVehicleState":"UNDER_REPAIR",
                                 "damageItems":[{"part":"Handlebar","note":"bent"}],
                                 "note":"swapped at the hub"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isOk());

        // A minor-damage return goes to the repair bench, and the job carries
        // the part-level detail the operator recorded.
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.UNDER_REPAIR);
        org.assertj.core.api.Assertions.assertThat(hasOpenJob(VEHICLE_READY)).isTrue();
        String damageNotes = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT damage_notes FROM service_jobs sj
                JOIN vehicles v ON v.id = sj.vehicle_id
                WHERE v.registry_id = ? AND sj.status = 'OPEN'
                """, String.class, VEHICLE_READY));
        org.assertj.core.api.Assertions.assertThat(damageNotes).contains("Handlebar: bent");
    }

    @Test
    void returnRulesAreEnforced() throws Exception {
        assign(RIDER_A, VEHICLE_READY);
        String token = tokenFor(ADMIN_EMAIL);

        // A destination outside the four a return may choose.
        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"READY_TO_DEPLOY",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Choose a return destination"))
                .andExpect(jsonPath("$.field").value("nextVehicleState"));

        // Damage rows on an undamaged return.
        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"QC_PENDING",
                                 "damageItems":[{"part":"Handlebar"}]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(
                        "Clear the damaged-part rows or choose a damage severity"))
                .andExpect(jsonPath("$.field").value("damageItems"));

        // A damaged return with no parts recorded.
        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"MINOR","nextVehicleState":"UNDER_REPAIR",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(
                        "Record the damaged parts before returning this bike"))
                .andExpect(jsonPath("$.field").value("damageItems"));

        // An override of the condition's default destination needs a note.
        mvc.perform(post("/api/v1/assignments/exchange")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","fromVehicleId":"%s","toVehicleId":"%s",
                                 "occurredOn":"2026-09-28","reason":"RIDER_REQUEST",
                                 "returnCondition":"NONE","nextVehicleState":"UNDER_REPAIR",
                                 "damageItems":[]}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY, VEHICLE_READY_2)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Explain the destination override"))
                .andExpect(jsonPath("$.field").value("note"));
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