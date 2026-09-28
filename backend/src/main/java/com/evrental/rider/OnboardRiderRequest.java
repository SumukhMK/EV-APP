package com.evrental.rider;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * What the onboard-rider form sends (screen 09), mirroring OnboardRiderRequest
 * in frontend/app/src/types/rider.ts.
 *
 * <p>A new rider lands on the register with no bike and KYC pending — both are
 * consequences of the workflow, not inputs, so the form does not offer them.
 *
 * <p>Several fields are validated and then deliberately not persisted:
 * aadhaarNumber (never stored in full), depositPaid (recorded against the
 * rider's ledger server-side — S6), the addresses, PAN, driving licence,
 * coordinates, platformRiderId and vehicleId (assignment is a separate
 * recorded event, S5). The register holds what Rider exposes.
 *
 * <p>Money arrives in paise: the form types rupees and converts at the edge
 * (OnboardRider.tsx: planAmount: values.planRupees * 100), so no conversion
 * happens here.
 */
public record OnboardRiderRequest(
        // Identity — step 1. Validated, never stored.
        @NotBlank(message = "Aadhaar number is required")
        @Pattern(regexp = "^\\d{12}$", message = "Aadhaar must be exactly 12 digits")
        String aadhaarNumber,
        @NotBlank(message = "Rider name is required")
        @Size(min = 3, max = 60, message = "Name must be 3 to 60 characters")
        String name,
        @NotBlank(message = "Permanent address is required")
        @Size(min = 5, max = 200, message = "Permanent address must be 5 to 200 characters")
        String permanentAddress,

        // Contact — step 2. One spare number beside the rider's own.
        @NotBlank(message = "Phone is required")
        @Pattern(regexp = "^[6-9]\\d{9}$", message = "Enter a 10 digit Indian mobile number")
        String phone,
        @NotBlank(message = "WhatsApp number is required")
        @Pattern(regexp = "^[6-9]\\d{9}$", message = "Enter a 10 digit Indian mobile number")
        String whatsappNumber,
        @NotBlank(message = "Alternate number is required")
        @Pattern(regexp = "^[6-9]\\d{9}$", message = "Enter a 10 digit Indian mobile number")
        String alternateNumber1,

        // Local address — step 3.
        @NotBlank(message = "Local address is required")
        @Size(min = 5, max = 200, message = "Local address must be 5 to 200 characters")
        String localAddress,
        @NotBlank(message = "City is required")
        @Size(min = 2, max = 100, message = "City must be at least 2 characters")
        String city,
        @NotBlank(message = "State is required")
        @Size(min = 2, max = 100, message = "State must be at least 2 characters")
        String state,
        @NotBlank(message = "PIN is required")
        @Pattern(regexp = "^\\d{6}$", message = "PIN must be exactly 6 digits")
        String pinCode,
        String locationCoordinates,

        // Optional documents — step 4.
        String panNumber,
        String drivingLicence,

        // Commercial — step 5.
        @NotBlank(message = "Working platform is required")
        String workingPlatform,
        String platformRiderId,
        @NotNull(message = "Weekly plan is required")
        @PositiveOrZero(message = "The weekly plan cannot be negative")
        Long planAmount,
        @NotNull(message = "Billing day is required")
        BillingDay billingDay,
        @NotNull(message = "Payment day is required")
        PaymentDay paymentDay,
        @NotNull(message = "Payment mode is required")
        PaymentMode paymentMode,
        @NotNull(message = "Deposit plan is required")
        @PositiveOrZero(message = "A deposit cannot be negative")
        Long depositPlan,
        @PositiveOrZero(message = "Deposit paid cannot be negative")
        Long depositPaid,
        @NotNull(message = "Onboarding date is required")
        LocalDate onboardedOn,

        /** Every flag must be true before the request is allowed to be sent. */
        @NotNull(message = "Verification is required")
        @Valid
        RiderVerification verification,

        /** The bike handed over at the counter. Assignment is a separate event, so this is ignored. */
        String vehicleId) {

    /** Which of the four identity fields have completed their OTP round-trip. */
    public record RiderVerification(
            boolean aadhaarVerified,
            boolean primaryVerified,
            boolean whatsappVerified,
            boolean alternate1Verified) {}
}