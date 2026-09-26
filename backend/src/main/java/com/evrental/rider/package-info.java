/**
 * The rider register (stage S2 in docs/BUILD.md — owner: Abhiram).
 *
 * <p>What a rider is, and the doors onto the register: onboard, list, search,
 * read. The Aadhaar is stored encrypted at rest (AadhaarCipher, AES-256-GCM,
 * key from the AADHAAR_ENCRYPTION_KEY environment variable) and never returned
 * by the API.
 *
 * <p>Assignment and payment are deliberately not here. A rider's bike is a
 * property of the open assignment (S5); what they owe is the payment module
 * (S6). The register holds the facts both read: the plan, the deposit, the
 * billing day.
 */
package com.evrental.rider;