package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.evrental.service.DamageCategory;
import com.evrental.service.ServiceJobClosedEvent;
import com.evrental.service.ServiceJobFacade;
import com.evrental.service.ServiceJobSource;
import com.evrental.vehicle.VehicleState;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * The two job-card boards (docs/backend/SERVICE_INFRA_SPLIT.md).
 *
 * <p>They are one table seen twice: the source decides the board, so a bike
 * cannot pick up a second, conflicting card by being filed on the other one.
 * Walk-in & RSA is an active rider's bike and only its spare parts are the
 * rider's money; Hub Service is a bike that is really back and bills as it
 * always did.
 */
@RecordApplicationEvents
class ServiceJobCategoryTest extends ServiceJobTestBase {

    @Autowired
    ApplicationEvents applicationEvents;

    @Autowired
    ServiceJobFacade facade;

    private String token;

    @BeforeEach
    void signIn() throws Exception {
        token = tokenFor(ADMIN_EMAIL);
    }

    private ResultActions open(String body) throws Exception {
        return mvc.perform(post("/api/v1/service/jobs")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String openedId(String body) throws Exception {
        String json = open(body).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return new ObjectMapper().readTree(json).get("id").asString();
    }

    private ResultActions close(String jobId, String body) throws Exception {
        return mvc.perform(post("/api/v1/service/jobs/" + jobId + "/close")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private List<ServiceJobClosedEvent> closedEvents() {
        return applicationEvents.stream(ServiceJobClosedEvent.class).toList();
    }

    private UUID rowIdOf(String jobCode) {
        return superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT id FROM service_jobs WHERE tenant_id = ? AND job_code = ?", UUID.class, TENANT, jobCode));
    }

    /** A walk-in card on the bike its rider is holding, costed and ready to close. */
    private String walkInJob(String repairType) throws Exception {
        holdBike(vehicleId);
        return openedId("""
                        {"vehicleId":"BLRSS0428","riderId":"%s","source":"WALK_IN","damageCategory":"MINOR",
                         "repairType":"%s","createdBy":"  Dhananjay  ","damageNotes":"Brakes squealing"}
                        """.formatted(RIDER_CODE, repairType));
    }

    // -----------------------------------------------------------------------
    // Which board a card lands on
    // -----------------------------------------------------------------------

    @Test
    void theSourceDecidesTheBoardAndTheClientCannotArgue() throws Exception {
        holdBike(vehicleId);

        // "category" is sent and ignored: it is not on the request at all.
        open("""
             {"vehicleId":"BLRSS0428","riderId":"%s","source":"WALK_IN","damageCategory":"MINOR",
              "category":"HUB","createdBy":"  Dhananjay  "}
             """.formatted(RIDER_CODE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("WALK_IN_RSA"))
                .andExpect(jsonPath("$.repairType").value("REPAIR_ONLY"))
                // Trimmed on the way in; a row of spaces would be nobody.
                .andExpect(jsonPath("$.createdBy").value("Dhananjay"))
                .andExpect(jsonPath("$.partsPaidPaise").value(0));
    }

    @Test
    void thePartsListedWhenTheCardOpensAreSavedWithIt() throws Exception {
        holdBike(vehicleId);

        open("""
             {"vehicleId":"BLRSS0428","riderId":"%s","source":"WALK_IN","damageCategory":"MINOR",
              "repairType":"REPAIR_AND_SPARE_PARTS","createdBy":"Dhananjay","damageNotes":"Brakes squealing",
              "items":[{"label":"Brake pads","costPaise":45000,"kind":"PART"},
                       {"label":"Fitting","costPaise":20000,"kind":"LABOUR"}]}
             """.formatted(RIDER_CODE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].label").value("Brake pads"))
                .andExpect(jsonPath("$.totalCostPaise").value(65000));
    }

    @Test
    void anRsaCalloutIsTheSameBoardAsAWalkIn() throws Exception {
        holdBike(vehicleId);

        open("""
             {"vehicleId":"BLRSS0428","riderId":"%s","source":"RSA","damageCategory":"MAJOR",
              "location":"Silk Board"}
             """.formatted(RIDER_CODE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("WALK_IN_RSA"))
                .andExpect(jsonPath("$.createdBy").doesNotExist());
    }

    @Test
    void everyOtherSourceIsHubService() throws Exception {
        insertVehicle(TENANT, "BLRSS0450", "CHASSIS0450", VehicleState.DEPLOYED);
        insertVehicle(TENANT, "BLRSS0451", "CHASSIS0451", VehicleState.INDUCTED);
        insertVehicle(TENANT, "BLRSS0452", "CHASSIS0452", VehicleState.RECOVERY);

        open("""
             {"vehicleId":"BLRSS0450","source":"QRT","damageCategory":"MINOR"}
             """)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("HUB"));
        open("""
             {"vehicleId":"BLRSS0451","source":"INSPECTION","damageCategory":"NONE"}
             """)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("HUB"));
        open("""
             {"vehicleId":"BLRSS0452","source":"RECOVERY","damageCategory":"MAJOR",
              "damageNotes":"Recovered after non-payment"}
             """)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("HUB"));
    }

    /** The list is where the boards are actually read, so it carries the fields too. */
    @Test
    void theListRowsSayWhichBoardTheyBelongTo() throws Exception {
        walkInJob("REPAIR_ONLY");

        mvc.perform(get("/api/v1/service/jobs").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].category").value("WALK_IN_RSA"))
                .andExpect(jsonPath("$.content[0].repairType").value("REPAIR_ONLY"))
                .andExpect(jsonPath("$.content[0].createdBy").value("Dhananjay"))
                .andExpect(jsonPath("$.content[0].partsPaidPaise").value(0));

        // Each board asks for its own half, so paging is per board.
        mvc.perform(get("/api/v1/service/jobs?category=WALK_IN_RSA")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/service/jobs?category=HUB")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    // -----------------------------------------------------------------------
    // Who may be taken in, and on whose bike
    // -----------------------------------------------------------------------

    @Test
    void aWalkInNeedsARider() throws Exception {
        open("""
             {"vehicleId":"BLRSS0428","source":"WALK_IN","damageCategory":"MINOR"}
             """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("riderId"))
                .andExpect(jsonPath("$.message").value("Pick an active rider who has this bike"));
    }

    @Test
    void aWalkInNeedsTheRiderWhoActuallyHasTheBike() throws Exception {
        // R01 exists and is active, but the bike is not theirs.
        open("""
             {"vehicleId":"BLRSS0428","riderId":"%s","source":"WALK_IN","damageCategory":"MINOR"}
             """.formatted(RIDER_CODE))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("riderId"));
    }

    @Test
    void aRecoveryNeedsABikeThatWasActuallyRecovered() throws Exception {
        open("""
             {"vehicleId":"BLRSS0428","source":"RECOVERY","damageCategory":"MAJOR"}
             """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    @Test
    void aReturnNeedsABikeThatWasActuallyHandedBack() throws Exception {
        open("""
             {"vehicleId":"BLRSS0428","source":"DEBOARD","damageCategory":"MINOR"}
             """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("vehicleId"));
    }

    /**
     * The handoff: a rider brings the bike in, then gives it back for good
     * while it is still on the bench. One card moves boards; a second card
     * would be two repairs on one bike.
     */
    @Test
    void handingTheBikeBackMovesTheCardToTheHubBoard() throws Exception {
        String jobId = walkInJob("REPAIR_ONLY");
        UUID rowId = rowIdOf(jobId);

        asTenant(() -> {
            facade.recordReturnOnOpenJob(rowId, RIDER_ID, ServiceJobSource.DEBOARD,
                    DamageCategory.MINOR, "Rear panel scratched", "Dhananjay");
            return null;
        });

        mvc.perform(get("/api/v1/service/jobs/" + jobId).header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.category").value("HUB"))
                .andExpect(jsonPath("$.activity[-1:].note")
                        .value("Moved to Hub Service — rider returned the bike"));

        Integer jobsOnBike = superAdmin(jdbc -> jdbc.queryForObject(
                "SELECT count(*) FROM service_jobs WHERE vehicle_id = ?", Integer.class, vehicleId));
        assertThat(jobsOnBike).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // Closing
    // -----------------------------------------------------------------------

    @Test
    void aWalkInChargesTheUnpaidPartsAndNeverTheLabour() throws Exception {
        String jobId = walkInJob("REPAIR_AND_SPARE_PARTS");

        close(jobId, """
              {"items":[{"label":"Brake pads","costPaise":50000,"kind":"PART"},
                        {"label":"Labour — 1hr","costPaise":30000,"kind":"LABOUR"}],
               "liability":"RIDER","technician":"Raju","partsPaidPaise":20000}
              """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCostPaise").value(80000))
                .andExpect(jsonPath("$.partsPaidPaise").value(20000));

        assertThat(closedEvents()).singleElement()
                .satisfies(event -> assertThat(event.totalCostPaise()).isEqualTo(30000));
    }

    @Test
    void aWalkInPaidForAtTheCounterRaisesNoChargeAtAll() throws Exception {
        String jobId = walkInJob("SPARE_PARTS");

        close(jobId, """
              {"items":[{"label":"Brake pads","costPaise":50000,"kind":"PART"},
                        {"label":"Labour — 1hr","costPaise":30000,"kind":"LABOUR"}],
               "liability":"RIDER","technician":"Raju","partsPaidPaise":50000}
              """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.partsPaidPaise").value(50000));

        assertThat(closedEvents()).isEmpty();
    }

    @Test
    void theDepositIsNotInPlayOnABikeTheRiderStillHas() throws Exception {
        String jobId = walkInJob("REPAIR_ONLY");

        close(jobId, """
              {"items":[{"label":"Brake pads","costPaise":50000,"kind":"PART"}],
               "liability":"DEPOSIT","technician":"Raju"}
              """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("liability"));
    }

    @Test
    void nobodyCanPayMoreForThePartsThanThePartsCost() throws Exception {
        String jobId = walkInJob("REPAIR_ONLY");

        close(jobId, """
              {"items":[{"label":"Brake pads","costPaise":50000,"kind":"PART"}],
               "liability":"RIDER","technician":"Raju","partsPaidPaise":60000}
              """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("partsPaidPaise"));
    }

    @Test
    void aSparePartsTicketCannotCloseWithoutASparePart() throws Exception {
        String jobId = walkInJob("SPARE_PARTS");

        close(jobId, """
              {"items":[{"label":"Labour — 1hr","costPaise":30000,"kind":"LABOUR"}],
               "liability":"COMPANY","technician":"Raju"}
              """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("items"))
                .andExpect(jsonPath("$.message").value("Add the spare parts used"));
    }

    @Test
    void nothingClosesWithoutSayingWhoResolvedIt() throws Exception {
        String jobId = walkInJob("REPAIR_ONLY");

        close(jobId, """
              {"items":[{"label":"Brake pads","costPaise":50000,"kind":"PART"}],
               "liability":"COMPANY"}
              """)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field").value("technician"))
                .andExpect(jsonPath("$.message").value("Enter who resolved the ticket"));
    }

    /** Hub Service bills the whole repair, labour and all, exactly as before. */
    @Test
    void aHubJobStillChargesTheWholeBill() throws Exception {
        holdBike(vehicleId);
        String jobId = openedId("""
                             {"vehicleId":"BLRSS0428","riderId":"%s","source":"QRT","damageCategory":"MINOR"}
                             """.formatted(RIDER_CODE));

        close(jobId, """
              {"items":[{"label":"Brake pads","costPaise":50000,"kind":"PART"},
                        {"label":"Labour — 1hr","costPaise":30000,"kind":"LABOUR"}],
               "liability":"RIDER","technician":"Raju","partsPaidPaise":20000}
              """)
                .andExpect(status().isOk())
                // Counter money is a walk-in idea; a hub job ignores it.
                .andExpect(jsonPath("$.partsPaidPaise").value(0));

        assertThat(closedEvents()).singleElement()
                .satisfies(event -> assertThat(event.totalCostPaise()).isEqualTo(80000));
    }
}
