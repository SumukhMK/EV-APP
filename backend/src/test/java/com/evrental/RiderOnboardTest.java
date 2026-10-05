package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Onboarding a rider (screen 09).
 *
 * <p>The shape under test is the contract's: a rider joins ACTIVE with KYC
 * pending and no bike, the deposit held is the deposit plan, money is paise,
 * and a duplicate phone is a 409 naming the field — the same pre-insert check
 * the mock performs.
 */
class RiderOnboardTest extends RiderTestBase {

    @Test
    void onboardReturnsTheFullRiderShape() throws Exception {
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.name").value("Ravi Kumar"))
                .andExpect(jsonPath("$.phone").value("9876543210"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.kycStatus").value("PENDING"))
                .andExpect(jsonPath("$.planAmount").value(175000))
                .andExpect(jsonPath("$.depositHeld").value(300000))
                .andExpect(jsonPath("$.billingDay").value("MONDAY"))
                .andExpect(jsonPath("$.currentVehicleId").doesNotExist())
                .andExpect(jsonPath("$.onboardedOn").value("2026-09-26"))
                .andExpect(jsonPath("$.paymentStatus").value("PENDING"))
                .andExpect(jsonPath("$.platform").value("Zomato"))
                .andExpect(jsonPath("$.paymentDay").value("MONDAY"))
                .andExpect(jsonPath("$.paymentMode").value("UPI"))
                .andExpect(jsonPath("$.aadhaarNumber").doesNotExist());
    }

    /**
     * The screen derives "deposit pending" from plan minus paid and will not
     * show a negative; the API took the figures as sent and stored a rider
     * who had paid more deposit than the plan asked for.
     */
    @Test
    void aDepositPaidAboveThePlanIs422OnTheDepositPaidField() throws Exception {
        String body = ONBOARD_BODY.replace("\"depositPaid\":300000", "\"depositPaid\":999999");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("depositPaid"))
                .andExpect(jsonPath("$.message").value("Deposit paid cannot be more than the deposit plan"));
    }

    /** A contract with no rent is not a contract; a rent of ten lakh a week is a typo. Both were stored. */
    @Test
    void aWeeklyPlanOfZeroOrOfTenLakhIs422OnThePlanField() throws Exception {
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY.replace("\"planAmount\":175000", "\"planAmount\":0")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("planAmount"))
                .andExpect(jsonPath("$.message").value("The weekly plan must be more than zero"));

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY.replace("\"planAmount\":175000", "\"planAmount\":100000000")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("planAmount"))
                .andExpect(jsonPath("$.message").value("A weekly plan above ₹25,000 is not a rent — check the amount"));
    }

    /** The same plan bounds when the plan is changed later. */
    @Test
    void aPlanChangeToZeroOrTenLakhIs422() throws Exception {
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY))
                .andExpect(status().isCreated());
        String code = riderCodeOf("9876543210");

        mvc.perform(post("/api/v1/riders/" + code + "/plan")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planAmount\":0}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("planAmount"))
                .andExpect(jsonPath("$.message").value("The weekly plan must be more than zero"));

        mvc.perform(post("/api/v1/riders/" + code + "/plan")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planAmount\":100000000}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("planAmount"))
                .andExpect(jsonPath("$.message").value("A weekly plan above ₹25,000 is not a rent — check the amount"));
    }

    private String riderCodeOf(String phone) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT rider_code FROM riders WHERE phone = ? AND tenant_id = ?", String.class, phone, TENANT));
    }

    /** Documents may be left blank, but one that is given must look like the real thing. */
    @Test
    void aPanOrDrivingLicenceInTheWrongShapeIs422OnItsField() throws Exception {
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY.replace("\"panNumber\":null", "\"panNumber\":\"PAN123\"")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("panNumber"))
                .andExpect(jsonPath("$.message").value("PAN must look like ABCDE1234F"));

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY.replace("\"drivingLicence\":null", "\"drivingLicence\":\"abc\"")))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("drivingLicence"))
                .andExpect(jsonPath("$.message").value("Driving licence must look like KA0120201234567"));

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY
                                .replace("\"panNumber\":null", "\"panNumber\":\"ABCDE1234F\"")
                                .replace("\"drivingLicence\":null", "\"drivingLicence\":\"KA01 20201234567\"")))
                .andExpect(status().isCreated());
    }

    /** Every other date the API takes refuses the future; onboarding did not. */
    @Test
    void anOnboardingDateInTheFutureIs422OnTheDateField() throws Exception {
        String body = ONBOARD_BODY.replace("\"onboardedOn\":\"2026-09-26\"", "\"onboardedOn\":\"2031-01-01\"");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("onboardedOn"))
                .andExpect(jsonPath("$.message").value("Onboarding date cannot be in the future"));
    }

    @Test
    void aDuplicatePhoneIsA409NamingTheField() throws Exception {
        // RIDER_A already holds 9845012277 on this tenant's register.
        String body = ONBOARD_BODY.replace("\"phone\":\"9876543210\"", "\"phone\":\"9845012277\"")
                .replace("\"whatsappNumber\":\"9876543210\"", "\"whatsappNumber\":\"9845012277\"");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("phone"))
                .andExpect(jsonPath("$.message")
                        .value("A rider with this phone number is already on the register"));
    }

    @Test
    void theSamePhoneIsFineOnAnotherTenantsRegister() throws Exception {
        // RIDER_B holds 9000000002 on OTHER_TENANT — TENANT's register is free to use it.
        String body = ONBOARD_BODY.replace("\"phone\":\"9876543210\"", "\"phone\":\"9000000002\"")
                .replace("\"whatsappNumber\":\"9876543210\"", "\"whatsappNumber\":\"9000000002\"");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());
    }

    @Test
    void aMalformedPhoneIsA422() throws Exception {
        String body = ONBOARD_BODY.replace("\"phone\":\"9876543210\"", "\"phone\":\"12345\"");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("phone"))
                .andExpect(jsonPath("$.message").value("Enter a 10 digit Indian mobile number"));
    }

    @Test
    void aMalformedAadhaarIsA422() throws Exception {
        String body = ONBOARD_BODY.replace("\"aadhaarNumber\":\"123456789012\"", "\"aadhaarNumber\":\"1234\"");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("aadhaarNumber"))
                .andExpect(jsonPath("$.message").value("Aadhaar must be exactly 12 digits"));
    }

    @Test
    void aNegativePlanIsA422() throws Exception {
        String body = ONBOARD_BODY.replace("\"planAmount\":175000", "\"planAmount\":-100");

        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("planAmount"))
                .andExpect(jsonPath("$.message").value("The weekly plan must be more than zero"));
    }

    @Test
    void theVerificationFlagsAreStoredForAudit() throws Exception {
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY))
                .andExpect(status().isCreated());

        // The response does not carry them (the contract has no such fields),
        // so the test reads the row the way an auditor would.
        Integer flags = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT (aadhaar_verified AND primary_verified AND whatsapp_verified "
                        + "AND alternate1_verified)::int FROM riders WHERE phone = '9876543210'",
                Integer.class));
        assertThat(flags).isEqualTo(1);
    }

    @Test
    void theAadhaarIsStoredEncryptedNotInTheClear() throws Exception {
        mvc.perform(post("/api/v1/riders")
                        .header("Authorization", "Bearer " + tokenFor(ADMIN_EMAIL))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ONBOARD_BODY))
                .andExpect(status().isCreated());

        // The response never carries the number, so the test reads the row the
        // way an auditor would — and proves the requirement: what the database
        // holds is ciphertext, not the Aadhaar, and it round-trips to the
        // original under the key only the server holds.
        String stored = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT aadhaar_encrypted FROM riders WHERE phone = '9876543210'", String.class));
        assertThat(stored).isNotBlank().doesNotContain("123456789012");
        assertThat(aadhaarCipher.decrypt(stored)).isEqualTo("123456789012");
    }
}