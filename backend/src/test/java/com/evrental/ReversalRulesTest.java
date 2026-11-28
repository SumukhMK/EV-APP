package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Who may reverse a payment, and until when (ReversalPolicy):
 * staff their own, same day, before the receipt is printed; a fleet admin up
 * to 7 days; a super admin any age, with a reason that says what happened.
 */
class ReversalRulesTest extends PaymentRunTestBase {

    private static final ObjectMapper JSON = new ObjectMapper();

    private UUID userId(String email) {
        return superAdmin(jdbc -> jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email));
    }

    /** A cash payment taken by {@code email}, {@code ageHours} ago. */
    private String paymentBy(String email, int ageHours) {
        UUID by = userId(email);
        return superAdmin(jdbc -> jdbc.queryForObject("""
                INSERT INTO payment_collections (tenant_id, rider_id, amount_paise, method, collected_on, collected_by_user_id)
                VALUES (?, ?, 10000, 'CASH', now() - make_interval(hours => ?), ?) RETURNING id
                """, UUID.class, TENANT, MONDAY_RIDER, ageHours, by)).toString();
    }

    /** A payment taken by the fleet admin on an earlier IST day, {@code days} back, at noon. */
    private String paymentDaysAgo(String email, int days) {
        UUID by = userId(email);
        return superAdmin(jdbc -> jdbc.queryForObject("""
                INSERT INTO payment_collections (tenant_id, rider_id, amount_paise, method, collected_on, collected_by_user_id)
                VALUES (?, ?, 10000, 'CASH', (?::date + time '12:00') AT TIME ZONE 'Asia/Kolkata', ?) RETURNING id
                """, UUID.class, TENANT, MONDAY_RIDER, today().minusDays(days).toString(), by)).toString();
    }

    private ResultActions reverse(String id, String reason, String email) throws Exception {
        return mvc.perform(post("/api/v1/payments/collections/" + id + "/reverse")
                .header("Authorization", "Bearer " + tokenFor(email))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"" + reason + "\"}"));
    }

    private void print(String id, String email) throws Exception {
        mvc.perform(post("/api/v1/payments/collections/" + id + "/receipt-issued")
                        .header("Authorization", "Bearer " + tokenFor(email)))
                .andExpect(status().isNoContent());
    }

    private JsonNode lineFor(String id, String email) throws Exception {
        JsonNode account = JSON.readTree(mvc.perform(get("/api/v1/payments/riders/" + MONDAY_RIDER_CODE + "/account")
                        .header("Authorization", "Bearer " + tokenFor(email)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode l : account.get("lines")) {
            if (id.equals(l.path("paymentId").asString())) return l;
        }
        throw new AssertionError("no line for payment " + id);
    }

    // ----------------------------------------------------------------- staff

    @Test
    void staffCanReverseTheirOwnPaymentTheSameDayBeforeTheReceiptIsPrinted() throws Exception {
        String id = paymentBy(STAFF_EMAIL, 0);
        assertThat(lineFor(id, STAFF_EMAIL).get("canReverse").asBoolean()).isTrue();
        reverse(id, "Typed the wrong amount", STAFF_EMAIL).andExpect(status().isOk());
    }

    @Test
    void onceTheReceiptIsPrintedStaffMustAskAnAdmin() throws Exception {
        String id = paymentBy(STAFF_EMAIL, 0);
        print(id, STAFF_EMAIL);

        JsonNode line = lineFor(id, STAFF_EMAIL);
        assertThat(line.get("canReverse").asBoolean()).isFalse();
        assertThat(line.get("reverseBlock").asString()).contains("receipt has been printed");
        assertThat(line.get("receiptIssuedAt").isNull()).isFalse();
        reverse(id, "Typed the wrong amount", STAFF_EMAIL).andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("RECEIPT_ISSUED"));

        // The admin still can: a printed receipt does not lock the mistake in.
        reverse(id, "Typed the wrong amount", ADMIN_EMAIL).andExpect(status().isOk());
    }

    @Test
    void aReprintDoesNotMoveTheFirstPrintTime() throws Exception {
        String id = paymentBy(ADMIN_EMAIL, 0);
        print(id, ADMIN_EMAIL);
        String first = lineFor(id, ADMIN_EMAIL).get("receiptIssuedAt").asString();
        print(id, ADMIN_EMAIL);
        assertThat(lineFor(id, ADMIN_EMAIL).get("receiptIssuedAt").asString()).isEqualTo(first);
    }

    @Test
    void staffCannotReverseYesterdaysPayment() throws Exception {
        String id = paymentDaysAgo(STAFF_EMAIL, 1);
        reverse(id, "Typed the wrong amount", STAFF_EMAIL).andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("REVERSE_DAY_CLOSED"));
    }

    @Test
    void staffCannotReverseSomeoneElsesPayment() throws Exception {
        String id = paymentBy(ADMIN_EMAIL, 0);
        assertThat(lineFor(id, STAFF_EMAIL).get("canReverse").asBoolean()).isFalse();
        reverse(id, "Typed the wrong amount", STAFF_EMAIL).andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("REVERSE_NOT_YOURS"));
    }

    @Test
    void theServiceManagerCannotReverseAtAll() throws Exception {
        String id = paymentBy(ADMIN_EMAIL, 0);
        reverse(id, "Typed the wrong amount", MANAGER_EMAIL).andExpect(status().isForbidden());
    }

    // ----------------------------------------------------------------- admins

    @Test
    void aFleetAdminCanReverseUpToSevenDaysBack() throws Exception {
        String id = paymentDaysAgo(STAFF_EMAIL, 6);
        reverse(id, "UPI failed", ADMIN_EMAIL).andExpect(status().isOk());
    }

    @Test
    void pastSevenDaysOnlyASuperAdminCanAndMustSayWhatHappened() throws Exception {
        String id = paymentDaysAgo(ADMIN_EMAIL, 8);

        assertThat(lineFor(id, ADMIN_EMAIL).get("canReverse").asBoolean()).isFalse();
        reverse(id, "UPI failed", ADMIN_EMAIL).andExpect(status().isConflict())
                .andExpect(jsonPath("$.details.code").value("REVERSE_TOO_OLD"));

        // A super admin working inside this company (the platform one sees no tenant's rows).
        superAdmin(jdbc -> jdbc.update("UPDATE users SET tenant_id = ? WHERE email = ?", TENANT, SUPER_ADMIN_EMAIL));
        reverse(id, "UPI failed", SUPER_ADMIN_EMAIL).andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.details.code").value("REASON_TOO_SHORT"))
                .andExpect(jsonPath("$.field").value("reason"));
        reverse(id, "Bank says the UPI transfer bounced on the 20th", SUPER_ADMIN_EMAIL)
                .andExpect(status().isOk());
    }
}
