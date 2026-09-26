package com.evrental.rider;

/**
 * The three KYC states, matching KycStatus in frontend/app/src/types/rider.ts.
 *
 * <p>A rider joins the register PENDING; nothing in the product changes it
 * yet — the four OTP flags are stored on the row, but no verify/reject step
 * exists. The label is what the UI prints (lib/labels.ts).
 */
public enum KycStatus {
    PENDING("KYC pending"),
    VERIFIED("Verified"),
    REJECTED("Rejected");

    private final String label;

    KycStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}