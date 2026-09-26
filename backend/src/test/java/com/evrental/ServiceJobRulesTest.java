package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The rules that only ever existed in the mock.
 *
 * <p>`mocks/serviceJobs.ts` enforced a handful of things the API did not: a
 * save needs a note, a claim queue needs a claim number, and a bike does not
 * go to QC or back on the road without somebody's name against the work. They
 * were real rules — the screens rely on them — living in a file that only runs
 * in the browser, which meant the API that Abhiram's S5 deboard code calls
 * through ServiceJobFacade enforced none of them.
 *
 * <p>Moved here, where every caller gets them. Each message is the mock's own,
 * so a screen that already prints it keeps printing the same sentence.
 */
class ServiceJobRulesTest extends ServiceJobTestBase {

    private String token;
    private UUID jobId;

    @BeforeEach
    void openOne() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
        jobId = openJob(token, "BLRSS0428", "MINOR");
    }

    private org.springframework.test.web.servlet.ResultActions update(String body) throws Exception {
        return mvc.perform(put("/api/v1/service/jobs/" + jobId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void everySaveNeedsANoteSayingWhatHappened() throws Exception {
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR","workSummary":"On the bench"}
               """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("note"))
                .andExpect(jsonPath("$.message")
                        .value("Write what you found, or why you are making this change"));
    }

    @Test
    void aBlankNoteIsNotANote() throws Exception {
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR","note":"   "}
               """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("note"));
    }

    @Test
    void aBareQcPrefixIsNotANoteEither() throws Exception {
        // hasServiceNote() in lib/serviceWorkflow.ts strips a leading
        // "QC passed:" / "QC failed:" before deciding, so the prefix alone
        // says nothing about what was actually found.
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR","note":"QC passed:  "}
               """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("note"));
    }

    @Test
    void aClaimQueueNeedsItsClaimNumber() throws Exception {
        for (String queue : new String[] {"WARRANTY", "INSURANCE", "PARTS_WAITING"}) {
            update("""
                   {"queue":"%s","damageCategory":"MINOR","note":"Sent off"}
                   """.formatted(queue))
                    .andExpect(status().isUnprocessableContent())
                    .andExpect(jsonPath("$.field").value("reference"))
                    .andExpect(jsonPath("$.message").value(
                            "Add the claim number, or say which parts you are waiting for"));
        }
    }

    @Test
    void aClaimQueueIsFineOnceTheReferenceIsThere() throws Exception {
        update("""
               {"queue":"PARTS_WAITING","damageCategory":"MINOR","note":"Waiting on a panel",
                "reference":"PO-4471"}
               """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reference").value("PO-4471"));
    }

    @Test
    void anOrdinaryRepairQueueNeedsNoReference() throws Exception {
        update("""
               {"queue":"MAJOR_REPAIR","damageCategory":"MAJOR","note":"Worse than it looked"}
               """)
                .andExpect(status().isOk());
    }

    @Test
    void nothingGoesToQcWithoutSayingWhoDidTheWork() throws Exception {
        update("""
               {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Panel replaced",
                "note":"Ready for checking"}
               """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("technician"))
                .andExpect(jsonPath("$.message").value(
                        "Say who did the work before QC or before the bike goes back out"));
    }

    @Test
    void nothingGoesToQcWithoutSayingWhatWasDone() throws Exception {
        update("""
               {"queue":"QC_PENDING","damageCategory":"MINOR","technician":"Raju",
                "note":"Ready for checking"}
               """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("workSummary"))
                .andExpect(jsonPath("$.message").value(
                        "Write what you did, or say that no repair was needed, "
                                + "before QC or before the bike goes back out"));
    }

    @Test
    void aFullyDescribedJobReachesQc() throws Exception {
        update("""
               {"queue":"QC_PENDING","damageCategory":"MINOR","workSummary":"Panel replaced",
                "technician":"Raju","note":"Ready for checking"}
               """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.queue").value("QC_PENDING"));
    }

    @Test
    void aJobStayingPutNeedsNeitherTechnicianNorSummary() throws Exception {
        // The rule is about leaving the bench, not about saving progress.
        update("""
               {"queue":"MINOR_REPAIR","damageCategory":"MINOR","note":"Still waiting on the rider"}
               """)
                .andExpect(status().isOk());
    }

    @Test
    void nobodyElseIsCharedWhenNoRiderIsOnTheBike() throws Exception {
        // The bike was opened with no rider, so there is nobody to bill.
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[{"label":"Left panel","costPaise":85000}],"liability":"RIDER"}
                                 """))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("liability"))
                .andExpect(jsonPath("$.message").value(
                        "No rider is on this bike, so the company has to cover the cost."));
    }

    @Test
    void theCompanyCanAlwaysCoverIt() throws Exception {
        mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[{"label":"Left panel","costPaise":85000}],"liability":"COMPANY"}
                                 """))
                .andExpect(status().isOk());
    }

    @Test
    void aRiderOnTheBikeCanBeCharged() throws Exception {
        UUID riderId = UUID.randomUUID();
        insertVehicle(TENANT, "BLRSS0601", "CHASSIS0601", com.evrental.vehicle.VehicleState.DEPLOYED);
        String body = mvc.perform(post("/api/v1/service/jobs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"vehicleId":"BLRSS0601","riderId":"%s","source":"DEBOARD",
                                  "damageCategory":"MINOR","damageNotes":"Scuffed"}
                                 """.formatted(riderId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID withRider = UUID.fromString(
                new tools.jackson.databind.ObjectMapper().readTree(body).get("id").asString());

        mvc.perform(post("/api/v1/service/jobs/" + withRider + "/close")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                 {"items":[{"label":"Left panel","costPaise":85000}],"liability":"RIDER"}
                                 """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liability").value("RIDER"));
    }
}
