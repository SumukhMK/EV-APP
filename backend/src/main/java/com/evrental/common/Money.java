package com.evrental.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Rupees at the desk, paise on the wire — converted once, at the API boundary
 * (docs/BUILD.md). Money is a {@code long} of minor units everywhere inside the
 * system; a {@code double} rupee amount never reaches a column or a response.
 */
public final class Money {

    private Money() {}

    public static long rupeesToPaise(BigDecimal rupees) {
        return rupees.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    public static BigDecimal paiseToRupees(long paise) {
        return BigDecimal.valueOf(paise).movePointLeft(2);
    }

    /**
     * Money is whole rupees. Paise stay the unit on the wire and in the columns
     * (so nothing changes shape), but every amount is a multiple of 100 —
     * V027 rounded the old ones, and this refuses new ones.
     */
    public static boolean isWholeRupees(long paise) {
        return paise % 100 == 0;
    }

    public static void requireWholeRupees(String field, long paise) {
        if (!isWholeRupees(paise)) {
            throw new ValidationException(field, "Enter whole rupees — no paise.",
                    java.util.Map.of("code", "NOT_WHOLE_RUPEES"));
        }
    }

    /** As the money screens print it: "₹1,400", whole rupees with Indian grouping. */
    public static String rupees(long paise) {
        java.text.NumberFormat f = java.text.NumberFormat.getIntegerInstance(java.util.Locale.of("en", "IN"));
        long whole = Math.round(Math.abs(paise) / 100.0);
        return (paise < 0 ? "−" : "") + "₹" + f.format(whole);
    }
}
