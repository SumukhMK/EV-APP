package com.evrental.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Why a payment is being reversed. Required: the audit log shows it. */
public record ReversePaymentRequest(@NotBlank @Size(max = 200) String reason) {
}
