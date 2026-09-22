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
}
