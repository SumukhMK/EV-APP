package com.evrental.vehicle;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * One bike, as the form and the bulk import both describe it.
 *
 * <p>The limits are {@code public static final} rather than literals inside
 * the annotations because two callers have to agree on them. The controller
 * applies them through {@code @Valid}; {@code VehicleImportService} cannot,
 * because it calls {@code VehicleService.create()} directly and never passes
 * through a controller. Before these constants existed the import path
 * enforced no lengths at all, so an over-long cell previewed as a valid row
 * and then failed inside Postgres at commit — reported to the operator as
 * "That value is already in use", which named neither the row nor the reason.
 *
 * <p>Each one matches its column in {@code V003__vehicles.sql}. A column
 * widened there has to be widened here, or the database will accept something
 * the API refuses.
 */
public record CreateVehicleRequest(
        @NotBlank(message = "Vehicle id is required")
        @Size(max = ID_MAX, message = "Vehicle id must be at most " + ID_MAX + " characters")
        String id,
        // A chassis number is the 17-character VIN stamped on the frame, and
        // every bike in the fleet has one. The form said so from the start;
        // the API accepted anything up to the column width, so a short one
        // from a spreadsheet or a direct call was stored.
        @NotBlank(message = "Chassis number is required")
        @Pattern(regexp = CHASSIS_PATTERN, message = CHASSIS_RULE)
        String chassisNumber,
        @NotBlank(message = "Model is required")
        @Size(max = MODEL_MAX, message = "Model must be at most " + MODEL_MAX + " characters")
        String model,
        @NotBlank(message = "Battery type is required")
        // Added with the import limits: battery_type is VARCHAR(20) and this
        // field carried no @Size at all, so the single-vehicle form had the
        // same failure the import did, one field over.
        @Size(max = BATTERY_TYPE_MAX, message = "Battery type must be at most " + BATTERY_TYPE_MAX + " characters")
        String batteryType,
        @Size(max = BATTERY_VENDOR_MAX, message = "Battery vendor must be at most " + BATTERY_VENDOR_MAX + " characters")
        String batteryVendor,
        @NotBlank(message = "Hub is required")
        @Size(max = HUB_MAX, message = "Hub must be at most " + HUB_MAX + " characters")
        String hub,
        @Size(max = REGISTRATION_NUMBER_MAX, message = "Registration number must be at most " + REGISTRATION_NUMBER_MAX + " characters")
        String registrationNumber,
        @NotNull(message = "Inducted on is required")
        @PastOrPresent(message = "Induction date cannot be in the future")
        LocalDate inductedOn) {

    public static final int ID_MAX = 20;
    /** The column width. The rule is {@link #CHASSIS_PATTERN}; this bounds what the import stages. */
    public static final int CHASSIS_NUMBER_MAX = 40;
    /** Exactly 17 letters and digits — a VIN. Shared with the import's row check. */
    public static final String CHASSIS_PATTERN = "^[A-Za-z0-9]{17}$";
    public static final String CHASSIS_RULE = "Chassis number must be exactly 17 letters and digits";
    public static final int MODEL_MAX = 60;
    public static final int BATTERY_TYPE_MAX = 20;
    public static final int BATTERY_VENDOR_MAX = 40;
    public static final int HUB_MAX = 80;
    public static final int REGISTRATION_NUMBER_MAX = 20;
}
