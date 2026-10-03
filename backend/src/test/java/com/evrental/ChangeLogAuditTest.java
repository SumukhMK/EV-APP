package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The two acts the trail could not see.
 *
 * <p>The audit log reads the records modules already write, which is what
 * stops it drifting. Two decisions left no record at all: a rider's weekly
 * plan changing — it moves money every week afterwards — and a user's role
 * changing, which hands somebody the ability to move it.
 *
 * <p>A rider's plan could not be changed at all, in fact. The controller said
 * "no update endpoint", so renegotiating rent meant deboarding and
 * re-onboarding, losing the rider's history and their deposit.
 */
class ChangeLogAuditTest extends RiderTestBase {

    @Test
    void aPlanChangeIsRecordedAndAppearsInTheTrail() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A + "/plan")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planAmount\":160000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planAmount").value(160000));

        mvc.perform(get("/api/v1/audit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.action == 'Plan changed')]").isNotEmpty())
                .andExpect(jsonPath("$.content[?(@.action == 'Plan changed')].after").value("1600.00"));
    }

    /** Saving the same number is not a change, and does not clutter the trail. */
    @Test
    void settingThePlanToWhatItAlreadyIsRecordsNothing() throws Exception {
        String body = mvc.perform(get("/api/v1/riders/" + RIDER_A)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andReturn().getResponse().getContentAsString();
        Integer current = com.jayway.jsonpath.JsonPath.read(body, "$.planAmount");

        mvc.perform(post("/api/v1/riders/" + RIDER_A + "/plan")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planAmount\":" + current + "}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/audit")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.action == 'Plan changed')]").isEmpty());
    }

    /** The plan is what a rider is billed every week, so it is a money decision. */
    @Test
    void fleetStaffCannotChangeAPlan() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A + "/plan")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planAmount\":100000}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void aNegativePlanIsRefused() throws Exception {
        mvc.perform(post("/api/v1/riders/" + RIDER_A + "/plan")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planAmount\":-1}"))
                .andExpect(status().isUnprocessableEntity());
    }
}
