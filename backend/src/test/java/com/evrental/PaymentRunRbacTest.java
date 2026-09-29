package com.evrental;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Who may see the books.
 *
 * <p>RBAC.md's Money section is the strictest gate in the application: "FS and
 * SM never see the section". A fleet hand can run up a repair cost, and a
 * service manager can price one, but neither may read what the fleet is owed
 * or write a debt off.
 *
 * <p>The single exception is the rider profile's payment history panel, which
 * FS-12 puts in the Riders section — and that exception is tested here too,
 * because an exception nobody tests is a rule that quietly disappears.
 */
class PaymentRunRbacTest extends PaymentRunTestBase {

    private static final String[] MONEY_READS = {
            "/api/v1/payments/runs/current?billingDay=MONDAY",
            "/api/v1/payments/overdue",
    };

    @Test
    void fleetStaffAreRefusedTheMoneySection() throws Exception {
        assertRefused(tokenFor(STAFF_EMAIL));
    }

    @Test
    void serviceManagersAreRefusedTheMoneySection() throws Exception {
        assertRefused(tokenFor(MANAGER_EMAIL));
    }

    private void assertRefused(String token) throws Exception {
        for (String url : MONEY_READS) {
            mvc.perform(get(url).header("Authorization", "Bearer " + token))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/payments/receipts/" + MONDAY_RIDER)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/payments/collections")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"riderId\":\"" + MONDAY_RIDER + "\",\"amount\":100,\"method\":\"CASH\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void fleetAdminsMaySeeEverything() throws Exception {
        String token = tokenFor(ADMIN_EMAIL);
        for (String url : MONEY_READS) {
            mvc.perform(get(url).header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void superAdminsMaySeeEverything() throws Exception {
        String token = tokenFor(SUPER_ADMIN_EMAIL);
        for (String url : MONEY_READS) {
            mvc.perform(get(url).header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
    }

    /** FS-12: fleet staff see a rider's payment history, on the rider's page. */
    @Test
    void fleetStaffMaySeeARidersHistoryPanel() throws Exception {
        mvc.perform(get("/api/v1/payments/riders/" + MONDAY_RIDER + "/periods")
                        .header("Authorization", "Bearer " + tokenFor(STAFF_EMAIL)))
                .andExpect(status().isOk());
    }

    /** The panel is a Riders-section page, and a service manager is not in it. */
    @Test
    void serviceManagersAreRefusedTheHistoryPanel() throws Exception {
        mvc.perform(get("/api/v1/payments/riders/" + MONDAY_RIDER + "/periods")
                        .header("Authorization", "Bearer " + tokenFor(MANAGER_EMAIL)))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousCallersAreRefused() throws Exception {
        mvc.perform(get("/api/v1/payments/runs/current")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/payments/overdue")).andExpect(status().isUnauthorized());
    }
}
