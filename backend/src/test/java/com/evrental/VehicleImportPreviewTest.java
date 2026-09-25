package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.vehicle.VehicleState;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.ObjectMapper;

class VehicleImportPreviewTest extends VehicleTestBase {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void previewReportsEveryRowAndImportsNothing() throws Exception {
        int before = superAdmin(jdbc -> jdbc.queryForObject("SELECT count(*) FROM vehicles", Integer.class));

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", """
                                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                                BLRSS0901,CH-901,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0001,2026-09-01
                                BLRSS0902,CH-902,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0002,2026-09-01
                                BLRSS0903,CH-903,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0003,2026-09-01
                                """))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(3))
                .andExpect(jsonPath("$.validRows").value(3))
                .andExpect(jsonPath("$.errorRows").value(0));

        int after = superAdmin(jdbc -> jdbc.queryForObject("SELECT count(*) FROM vehicles", Integer.class));
        assertThat(after).isEqualTo(before);
    }

    @Test
    void aRowMissingARequiredColumnIsAnErrorRow() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", """
                                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                                BLRSS0901,CH-901,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0001,2026-09-01
                                BLRSS0902,CH-902,,Yuma,Yuma,Koramangala,KA01AA0002,2026-09-01
                                BLRSS0903,CH-903,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0003,2026-09-01
                                """))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(2))
                .andExpect(jsonPath("$.rows[1].error").isNotEmpty());
    }

    @Test
    void aRowDuplicatingAnExistingRegistryIdIsAnErrorRow() throws Exception {
        insertVehicle("BLRSS0900", "CH-900", VehicleState.INDUCTED);

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", """
                                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                                BLRSS0900,CH-901,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0001,2026-09-01
                                BLRSS0902,CH-902,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0002,2026-09-01
                                """))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].error").isNotEmpty());
    }

    @Test
    void twoRowsInOneFileWithTheSameRegistryIdAreBothFlagged() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", """
                                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                                BLRSS0904,CH-904,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0001,2026-09-01
                                BLRSS0904,CH-905,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0002,2026-09-01
                                """))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].error").isNotEmpty())
                .andExpect(jsonPath("$.rows[1].error").isNotEmpty());
    }

    @Test
    void previewReturnsAnImportIdThatCommitCanUse() throws Exception {
        MvcResult result = mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", """
                                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                                BLRSS0906,CH-906,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0006,2026-09-01
                                """))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andReturn();

        String importId = objectMapper.readTree(result.getResponse().getContentAsString()).get("importId").asString();
        assertThat(UUID.fromString(importId)).isNotNull();
    }

    @Test
    void anEmptyFileIs422() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", ""))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void aFileWithOnlyAHeaderIs422() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", "id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void fleetStaffCannotUpload() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv("vehicles.csv", """
                                id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn
                                BLRSS0907,CH-907,Eagle 2,Yuma,Yuma,Koramangala,KA01AA0007,2026-09-01
                                """))
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isForbidden());
    }

    private static MockMultipartFile csv(String name, String content) {
        return new MockMultipartFile("file", name, "text/csv", content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
