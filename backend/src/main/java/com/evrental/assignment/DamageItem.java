package com.evrental.assignment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** One damaged part on a returned bike, mirroring the damageItems rows in the exchange and deboard forms. */
public record DamageItem(
        @NotBlank String part,
        @Size(max = 300) String note) {
}