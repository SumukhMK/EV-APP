package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Two things the preview used to promise and the commit then broke.
 *
 * <p><b>Length.</b> The {@code @Size} limits on CreateVehicleRequest are
 * applied by {@code @Valid} at the controller, and the import path does not go
 * through it — it calls VehicleService.create() directly. So a row with a
 * 200-character model previewed as valid and died inside Postgres at commit
 * with "value too long for type character varying(60)", which the error
 * handler turned into a 409 reading "That value is already in use". Wrong
 * field, wrong reason, and because commit is one transaction the entire
 * import rolled back: the user was told 1 row would import and got none.
 *
 * <p><b>Reporting.</b> A row that passed preview and then failed the
 * commit-time re-check was skipped with {@code continue} and nothing else.
 * The imported count simply came back lower than the preview promised, with
 * no way to find out which row went missing.
 */
class VehicleImportLimitsTest extends VehicleTestBase {

    private static final String HEADER =
            "id,chassisNumber,model,batteryType,batteryVendor,hub,registrationNumber,inductedOn\n";

    @Test
    void anOverLongValueIsAnErrorRowInThePreview() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(HEADER
                                + "LIMIT001,LCH-001," + "M".repeat(61)
                                + ",Yuma,Yuma,Koramangala,KA01AA7001,2026-09-01\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(0))
                .andExpect(jsonPath("$.errorRows").value(1))
                // Names the field and the limit, so the operator can fix the cell.
                .andExpect(jsonPath("$.rows[0].error").value("model must be at most 60 characters"));
    }

    @Test
    void everyBoundedFieldIsChecked() throws Exception {
        String body = HEADER
                + "I".repeat(21) + ",LCH-010,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7010,2026-09-01\n"
                + "LIMIT011," + "C".repeat(41) + ",Eagle 2,Yuma,Yuma,Koramangala,KA01AA7011,2026-09-01\n"
                + "LIMIT012,LCH-012,Eagle 2," + "B".repeat(21) + ",Yuma,Koramangala,KA01AA7012,2026-09-01\n"
                + "LIMIT013,LCH-013,Eagle 2,Yuma," + "V".repeat(41) + ",Koramangala,KA01AA7013,2026-09-01\n"
                + "LIMIT014,LCH-014,Eagle 2,Yuma,Yuma," + "H".repeat(81) + ",KA01AA7014,2026-09-01\n"
                + "LIMIT015,LCH-015,Eagle 2,Yuma,Yuma,Koramangala," + "R".repeat(21) + ",2026-09-01\n";

        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(body))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(6))
                .andExpect(jsonPath("$.errorRows").value(6))
                .andExpect(jsonPath("$.rows[0].error").value("id must be at most 20 characters"))
                .andExpect(jsonPath("$.rows[1].error").value("chassisNumber must be at most 40 characters"))
                .andExpect(jsonPath("$.rows[2].error").value("batteryType must be at most 20 characters"))
                .andExpect(jsonPath("$.rows[3].error").value("batteryVendor must be at most 40 characters"))
                .andExpect(jsonPath("$.rows[4].error").value("hub must be at most 80 characters"))
                .andExpect(jsonPath("$.rows[5].error").value("registrationNumber must be at most 20 characters"));
    }

    /** The boundary itself is allowed; only one past it is not. */
    @Test
    void aValueExactlyAtTheLimitIsAccepted() throws Exception {
        mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(HEADER
                                + "LIMIT020,LCH-020," + "M".repeat(60)
                                + ",Yuma,Yuma,Koramangala,KA01AA7020,2026-09-01\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1))
                .andExpect(jsonPath("$.errorRows").value(0));
    }

    /** The whole point: what previewed as importable actually imports. */
    @Test
    void aCleanFileStillCommitsEveryRow() throws Exception {
        MvcResult preview = mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(HEADER
                                + "LIMIT030,LCH-030,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7030,2026-09-01\n"
                                + "LIMIT031,LCH-031,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7031,2026-09-01\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(2))
                .andReturn();

        mvc.perform(post("/api/v1/vehicles/imports/" + importId(preview) + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(2))
                .andExpect(jsonPath("$.skipped").value(0))
                .andExpect(jsonPath("$.skippedRows.length()").value(0));
    }

    /**
     * The gap between preview and commit: the bike is created by someone else
     * in between, so a row that previewed clean no longer is. It must be
     * reported, not silently dropped.
     */
    @Test
    void aRowThatGoesStaleBetweenPreviewAndCommitIsReported() throws Exception {
        MvcResult preview = mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(HEADER
                                + "LIMIT040,LCH-040,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7040,2026-09-01\n"
                                + "LIMIT041,LCH-041,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7041,2026-09-01\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(2))
                .andReturn();

        // Someone else inducts that bike while the preview is on screen.
        insertVehicle("LIMIT040", "LCH-040", com.evrental.vehicle.VehicleState.INDUCTED);

        mvc.perform(post("/api/v1/vehicles/imports/" + importId(preview) + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(1))
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.skippedRows[0].rowNumber").value(1))
                .andExpect(jsonPath("$.skippedRows[0].id").value("LIMIT040"))
                .andExpect(jsonPath("$.skippedRows[0].error").value("id already exists"));
    }

    /** Rows the preview already failed are not re-reported as surprises. */
    @Test
    void rowsThatFailedThePreviewAreNotCountedAsSkippedAtCommit() throws Exception {
        MvcResult preview = mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(HEADER
                                + "LIMIT050,LCH-050,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7050,2026-09-01\n"
                                + "LIMIT051,LCH-051,,Yuma,Yuma,Koramangala,KA01AA7051,2026-09-01\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorRows").value(1))
                .andReturn();

        mvc.perform(post("/api/v1/vehicles/imports/" + importId(preview) + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(1))
                // The user was already told about this row in the preview.
                .andExpect(jsonPath("$.skipped").value(0));
    }

    /** Whitespace is trimmed consistently, so a padded cell is not a stale row. */
    @Test
    void aPaddedValueIsTreatedTheSameAtPreviewAndCommit() throws Exception {
        MvcResult preview = mvc.perform(multipart("/api/v1/vehicles/imports")
                        .file(csv(HEADER
                                + "  LIMIT060  ,  LCH-060  ,Eagle 2,Yuma,Yuma,Koramangala,KA01AA7060,2026-09-01\n"))
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validRows").value(1))
                .andReturn();

        mvc.perform(post("/api/v1/vehicles/imports/" + importId(preview) + "/commit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(1))
                .andExpect(jsonPath("$.skipped").value(0));

        Integer found = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM vehicles WHERE tenant_id = ? AND registry_id = ?",
                Integer.class, TENANT, "LIMIT060"));
        assertThat(found).isEqualTo(1);
    }

    private static String importId(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.importId");
    }

    private static MockMultipartFile csv(String content) {
        return new MockMultipartFile("file", "vehicles.csv", "text/csv",
                content.getBytes(StandardCharsets.UTF_8));
    }
}
