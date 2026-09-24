package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleImportSweeper;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.ObjectMapper;

class VehicleImportCommitTest extends VehicleTestBase {

    @Autowired
    VehicleImportSweeper sweeper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private String importId;

    @BeforeEach
    void stageImport() throws Exception {
        // Row 3 errors on its own (model is required). A duplicate id would not
        // work here: that flags both copies, so the file would have two errored
        // rows, not the one this fixture wants.
        importId = stage("""
                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                BLRSS0910,CH-910,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0010,2026-09-01
                BLRSS0911,CH-911,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0011,2026-09-01
                BLRSS0912,CH-912,,Yuma,Yuma,Koramangala,KA01AA0012,2026-09-01
                """);
    }

    @Test
    void commitImportsTheValidRowsAndSkipsTheErrored() throws Exception {
        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(2));

        Integer count = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicles WHERE registry_id IN ('BLRSS0910','BLRSS0911')", Integer.class));
        assertThat(count).isEqualTo(2);
    }

    @Test
    void everyImportedVehicleStartsInductedWithALifecycleRow() throws Exception {
        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());

        Integer inducted = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicles WHERE registry_id IN ('BLRSS0910','BLRSS0911') AND state = 'INDUCTED'",
                Integer.class));
        Integer lifecycle = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicle_lifecycle_events e JOIN vehicles v ON v.id = e.vehicle_id "
                        + "WHERE v.registry_id IN ('BLRSS0910','BLRSS0911') AND e.to_state = 'INDUCTED'",
                Integer.class));
        assertThat(inducted).isEqualTo(2);
        assertThat(lifecycle).isEqualTo(2);
    }

    @Test
    void committingTwiceIs409() throws Exception {
        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isConflict());
    }

    @Test
    void committingAnUnknownImportIs404() throws Exception {
        mvc.perform(post("/api/v1/vehicles/imports/" + UUID.randomUUID() + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void anotherTenantsImportIs404() throws Exception {
        UUID otherImport = superAdmin(jdbc -> jdbc.queryForObject(
                "INSERT INTO vehicle_imports (tenant_id, file_name, uploaded_by, status) VALUES (?, 'other.csv', ?, 'PENDING') RETURNING id",
                UUID.class, OTHER_TENANT, adminUserId));

        mvc.perform(post("/api/v1/vehicles/imports/" + otherImport + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void anExpiredImportCannotBeCommitted() throws Exception {
        superAdmin(jdbc -> jdbc.update(
                "UPDATE vehicle_imports SET uploaded_on = now() - interval '48 hours' WHERE id = ?::uuid", importId));
        sweeper.expireAbandonedImports();

        mvc.perform(post("/api/v1/vehicles/imports/" + importId + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isConflict());
    }

    @Test
    void theSweeperExpiresPendingImportsOlderThanADayAndLeavesCommittedOnesAlone() throws Exception {
        String secondImport = stage("""
                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                BLRSS0913,CH-913,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0013,2026-09-01
                """);
        mvc.perform(post("/api/v1/vehicles/imports/" + secondImport + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk());

        superAdmin(jdbc -> jdbc.update(
                "UPDATE vehicle_imports SET uploaded_on = now() - interval '48 hours' WHERE id = ?::uuid", importId));
        superAdmin(jdbc -> jdbc.update(
                "UPDATE vehicle_imports SET uploaded_on = now() - interval '48 hours' WHERE id = ?::uuid", secondImport));

        sweeper.expireAbandonedImports();

        String expired = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT status FROM vehicle_imports WHERE id = ?::uuid", String.class, importId));
        String committed = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT status FROM vehicle_imports WHERE id = ?::uuid", String.class, secondImport));
        assertThat(expired).isEqualTo("EXPIRED");
        assertThat(committed).isEqualTo("COMMITTED");
    }

    private String stage(String csv) throws Exception {
        MvcResult result = mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(file("vehicles.csv", csv))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("importId").asString();
    }

    private static MockMultipartFile file(String name, String content) {
        return new MockMultipartFile("file", name, "text/csv", content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
