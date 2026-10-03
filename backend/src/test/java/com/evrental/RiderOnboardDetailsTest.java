package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * What the onboarding form asks for is what the register keeps.
 *
 * <p>It was not. {@code OnboardRiderRequest} validated five steps and
 * {@code RiderService} wrote eight fields, so an operator typed an address, a
 * PIN, a PAN, a licence and the deposit actually handed over, the form
 * accepted all of it, and reopening the rider showed none of it. Three of the
 * five steps left no record at all — including the WhatsApp and alternate
 * numbers, which are how a rider is reached when the primary stops answering.
 */
class RiderOnboardDetailsTest extends RiderTestBase {

    private static final String BODY = """
            {
              "aadhaarNumber": "123456789012",
              "name": "Sunil Kamat",
              "permanentAddress": "12 Old Madras Road, Bengaluru",
              "phone": "9845090001",
              "whatsappNumber": "9845090002",
              "alternateNumber1": "9845090003",
              "localAddress": "4th Cross, Koramangala",
              "city": "Bengaluru",
              "state": "Karnataka",
              "pinCode": "560034",
              "locationCoordinates": "12.9352,77.6245",
              "panNumber": "ABCDE1234F",
              "drivingLicence": "KA0120210001234",
              "workingPlatform": "Zomato",
              "platformRiderId": "ZM-99881",
              "planAmount": 190000,
              "billingDay": "MONDAY",
              "paymentDay": "MONDAY",
              "paymentMode": "UPI",
              "depositPlan": 300000,
              "depositPaid": 150000,
              "onboardedOn": "2026-10-01",
              "verification": {
                "aadhaarVerified": true, "primaryVerified": true,
                "whatsappVerified": true, "alternate1Verified": true
              }
            }
            """;

    @Test
    void everyAnswerTheFormCollectsSurvivesOnboarding() throws Exception {
        MvcResult created = mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isCreated())
                .andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/v1/riders/" + id)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permanentAddress").value("12 Old Madras Road, Bengaluru"))
                .andExpect(jsonPath("$.whatsappNumber").value("9845090002"))
                .andExpect(jsonPath("$.alternateNumber1").value("9845090003"))
                .andExpect(jsonPath("$.localAddress").value("4th Cross, Koramangala"))
                .andExpect(jsonPath("$.city").value("Bengaluru"))
                .andExpect(jsonPath("$.state").value("Karnataka"))
                .andExpect(jsonPath("$.pinCode").value("560034"))
                .andExpect(jsonPath("$.locationCoordinates").value("12.9352,77.6245"))
                .andExpect(jsonPath("$.panNumber").value("ABCDE1234F"))
                .andExpect(jsonPath("$.drivingLicence").value("KA0120210001234"))
                .andExpect(jsonPath("$.platformRiderId").value("ZM-99881"))
                .andExpect(jsonPath("$.depositPaid").value(150000));
    }

    /** The Aadhaar is still never returned, not even now that neighbours are. */
    @Test
    void theAadhaarIsStillNotOnTheWire() throws Exception {
        MvcResult created = mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("9845090001", "9845090011")
                                     .replace("123456789012", "123456789013")))
                .andExpect(status().isCreated())
                .andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/v1/riders/" + id)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aadhaarNumber").doesNotExist())
                .andExpect(jsonPath("$.aadhaarEncrypted").doesNotExist());
    }

    /** An unanswered optional is absent, not an empty string. */
    @Test
    void aBlankOptionalIsStoredAsNothing() throws Exception {
        MvcResult created = mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("9845090001", "9845090021")
                                     .replace("123456789012", "123456789014")
                                     .replace("\"ABCDE1234F\"", "\"   \"")))
                .andExpect(status().isCreated())
                .andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/v1/riders/" + id)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.panNumber").doesNotExist());
    }

    /** Deposit paid defaults to the plan, because that is what onboarding means. */
    @Test
    void anUnstatedDepositPaidDefaultsToThePlan() throws Exception {
        MvcResult created = mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.replace("9845090001", "9845090031")
                                     .replace("123456789012", "123456789015")
                                     .replace("\"depositPaid\": 150000,", "")))
                .andExpect(status().isCreated())
                .andReturn();
        String id = com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/v1/riders/" + id)
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.depositPaid").value(300000));
    }
}
