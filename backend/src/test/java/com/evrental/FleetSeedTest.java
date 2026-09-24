package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import com.evrental.platform.DevFleetSeeder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * The seed CSV is generated, so the risk is not that it is malformed — it is
 * that it drifts from the schema it loads into, or that the parser is a naive
 * split that works until a value contains a comma.
 */
class FleetSeedTest {

    private static final String[] EXPECTED_HEADER = {
        "registryId", "chassisNumber", "model", "make", "batteryType",
        "batteryVendor", "hub", "state", "registrationNumber", "odometerKm", "inductedOn"
    };

    @Test
    @DisplayName("the generated seed is present and still has the columns the seeder reads by index")
    void theSeedFileMatchesTheColumnsTheSeederExpects() throws Exception {
        ClassPathResource resource = new ClassPathResource("db/seed/fleet.csv");
        assertThat(resource.exists())
                .as("run `npm run seed:export` in frontend/app")
                .isTrue();

        String content = new String(resource.getContentAsByteArray());
        // CRLF on a Windows checkout must not leak a \r into the last column.
        String[] lines = content.split("\r?\n");
        assertThat(DevFleetSeeder.parseCsvLine(lines[0])).containsExactly(EXPECTED_HEADER);

        // 137 is the fleet the dashboard tiles are pinned to; a seed that
        // quietly loads a different number makes the wired screen disagree
        // with the mock one for a reason nobody would look for.
        assertThat(lines).hasSize(138);
        for (String line : lines) {
            assertThat(DevFleetSeeder.parseCsvLine(line)).hasSize(EXPECTED_HEADER.length);
        }
    }

    @Test
    @DisplayName("a quoted value keeps its comma instead of becoming two columns")
    void quotedCellsSurviveTheParser() {
        assertThat(DevFleetSeeder.parseCsvLine("BLRSS0428,\"Whitefield, North\",12"))
                .containsExactly("BLRSS0428", "Whitefield, North", "12");
        assertThat(DevFleetSeeder.parseCsvLine("a,\"say \"\"hi\"\"\",b"))
                .containsExactly("a", "say \"hi\"", "b");
        assertThat(DevFleetSeeder.parseCsvLine("a,,b")).containsExactly("a", "", "b");
    }
}
