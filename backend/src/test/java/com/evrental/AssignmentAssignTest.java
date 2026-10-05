package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Assign: a bike goes out to a rider. One rider, one bike — the register's
 * oldest rule — and a bike can only leave the yard from READY_TO_DEPLOY.
 */
class AssignmentAssignTest extends AssignmentTestBase {

    @Test
    void assignsABikeToARider() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(RIDER_A_CODE))
                .andExpect(jsonPath("$.currentVehicleId").value(VEHICLE_READY))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // The bike is out, and the open assignment row is the single source of
        // truth for who has it.
        org.assertj.core.api.Assertions.assertThat(stateOf(VEHICLE_READY))
                .isEqualTo(com.evrental.vehicle.VehicleState.DEPLOYED);
        Integer openAssignments = superAdmin(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM assignments
                WHERE tenant_id = ? AND rider_id = ? AND ended_on IS NULL
                """, Integer.class, TENANT, RIDER_A));
        org.assertj.core.api.Assertions.assertThat(openAssignments).isEqualTo(1);
    }

    /** Rent starts on the assignment date; a date that has not come yet would bill for days nobody rode. */
    @Test
    void aStartDateInTheFutureIs422() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2031-01-01"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("startedOn"))
                .andExpect(jsonPath("$.message").value("Assignment date cannot be in the future"));
    }

    @Test
    void anUnknownRiderIsA404() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(java.util.UUID.randomUUID(), VEHICLE_READY)))
                .andExpect(status().isNotFound());
    }

    /**
     * Deboarded means "done with that bike", not gone (settled with Sumukh,
     * 2026-10-05): the assignment itself puts the rider back on the register.
     */
    @Test
    void aDeboardedRiderIsPutBackOnTheRegisterByTheAssignment() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_DEBOARDED_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.currentVehicleId").value(VEHICLE_READY));

        org.assertj.core.api.Assertions.assertThat(lastLifecycleNote(VEHICLE_READY))
                .isEqualTo("Assigned to Vinod Naik — put back on the register");
    }

    /** A suspension is a decision about a person; the assign flow does not undo it. */
    @Test
    void aSuspendedRiderStillCannotHoldABike() throws Exception {
        superAdmin(jdbc -> jdbc.update("UPDATE riders SET status = 'SUSPENDED' WHERE id = ?", RIDER_A));

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Anil Shetty is suspended and cannot hold a bike"))
                .andExpect(jsonPath("$.field").value("riderId"));
    }

    /** Dues are carried, not cleared: a rider who owes less than the deposit gets the bike and the log says what they owe. */
    @Test
    void duesWithinTheDepositAreCarriedAndRecorded() throws Exception {
        insertOpenCharge(RIDER_A, 120000L); // deposit held is 3,00,000

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.duesPaise").value(120000));

        org.assertj.core.api.Assertions.assertThat(lastLifecycleNote(VEHICLE_READY))
                .isEqualTo("Assigned to Anil Shetty — owes ₹1,200");
    }

    /** The deposit is the limit: above it the bike does not go out without an admin. */
    @Test
    void duesAboveTheDepositAreRefusedWithTheNumbers() throws Exception {
        insertOpenCharge(RIDER_A, 450000L);

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("dues"))
                .andExpect(jsonPath("$.message").value(
                        "Anil Shetty owes ₹4,500 against a deposit of ₹3,000 — collect first, or an admin can override with a note"));

        // A fleet hand asking for the override is still refused: the say-so is an admin's.
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28",
                                 "overrideDues":true,"note":"He promised to pay Friday"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("dues"));
    }

    @Test
    void anAdminCanOverrideTheDepositLimitWithANoteAndItIsLogged() throws Exception {
        insertOpenCharge(RIDER_A, 450000L);

        // No note, no override.
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28","overrideDues":true}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("note"))
                .andExpect(jsonPath("$.message").value("Say why the bike is going out despite the dues"));

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28",
                                 "overrideDues":true,"note":"Pays from this week's earnings"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVehicleId").value(VEHICLE_READY));

        org.assertj.core.api.Assertions.assertThat(lastLifecycleNote(VEHICLE_READY))
                .isEqualTo("Assigned to Anil Shetty — owes ₹4,500; above the deposit, admin override by Meenakshi Iyer: "
                        + "Pays from this week's earnings");
    }

    private void insertOpenCharge(java.util.UUID riderId, long paise) {
        superAdmin(jdbc -> jdbc.update(
                "INSERT INTO rider_charges (tenant_id, rider_id, amount_paise, liability, status, period_start) "
                        + "VALUES (?, ?, ?, 'RIDER', 'OPEN', DATE '2026-09-21')",
                TENANT, riderId, paise));
    }

    private String lastLifecycleNote(String registryId) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT e.note FROM vehicle_lifecycle_events e JOIN vehicles v ON v.id = e.vehicle_id "
                        + "WHERE v.registry_id = ? ORDER BY e.occurred_on DESC, e.id DESC LIMIT 1",
                String.class, registryId));
    }

    @Test
    void aRiderHoldingABikeCannotBeAssignedAnother() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_READY_2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Anil Shetty already holds " + VEHICLE_READY + ". Use Exchange vehicle instead."))
                .andExpect(jsonPath("$.field").value("riderId"));
    }

    @Test
    void anUnknownBikeIsA404() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"BLRSS9999","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE)))
                .andExpect(status().isNotFound());
    }

    @Test
    void aBikeThatIsNotReadyToDeployCannotBeAssigned() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_A_CODE, VEHICLE_DEPLOYED)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(VEHICLE_DEPLOYED + " is not Ready to Deploy"))
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    @Test
    void aBikeWithARiderCannotBeAssigned() throws Exception {
        assign(RIDER_A, VEHICLE_READY);

        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_C_CODE, VEHICLE_READY)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(VEHICLE_READY + " is not Ready to Deploy"))
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    @Test
    void anotherTenantsRiderIsA404NotALeak() throws Exception {
        // RLS hides RIDER_B from TENANT's callers, so the assign must 404
        // rather than put a bike on another operator's rider.
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"riderId":"%s","vehicleId":"%s","startedOn":"2026-09-28"}
                                """.formatted(RIDER_B_CODE, VEHICLE_READY)))
                .andExpect(status().isNotFound());
    }

    @Test
    void missingFieldsAreA422() throws Exception {
        mvc.perform(post("/api/v1/assignments/assign")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnprocessableEntity());
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