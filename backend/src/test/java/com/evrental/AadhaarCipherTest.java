package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.evrental.common.AadhaarCipher;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/**
 * The Aadhaar cipher, tested without Spring: the key is a constructor
 * argument, so the round-trip, the random IV, and the failure modes are all
 * checkable in isolation. The integration side — the register stores
 * ciphertext, not the number — is RiderOnboardTest.
 */
class AadhaarCipherTest {

    private static final String KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
    private static final String OTHER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    private final AadhaarCipher cipher = new AadhaarCipher(KEY);

    @Test
    void aStoredValueRoundTrips() {
        assertThat(cipher.decrypt(cipher.encrypt("123456789012"))).isEqualTo("123456789012");
    }

    @Test
    void theSameNumberEncryptsDifferentlyEveryTime() {
        // A fresh random IV per value: two encryptions of the same number must
        // not look alike, or a reader of the table could tell two riders share
        // an Aadhaar.
        assertThat(cipher.encrypt("123456789012")).isNotEqualTo(cipher.encrypt("123456789012"));
    }

    @Test
    void theCiphertextNeverContainsTheNumber() {
        assertThat(cipher.encrypt("123456789012")).doesNotContain("123456789012");
    }

    @Test
    void theWrongKeyCannotDecrypt() {
        String stored = cipher.encrypt("123456789012");
        assertThatThrownBy(() -> new AadhaarCipher(OTHER_KEY).decrypt(stored))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aTamperedValueCannotDecrypt() {
        // GCM authenticates the ciphertext: flip a byte and the tag check
        // fails, so a corrupted row is refused rather than misread.
        String stored = cipher.encrypt("123456789012");
        String[] parts = stored.split(":");
        String flipped = (parts[2].charAt(0) == 'A' ? "B" : "A") + parts[2].substring(1);
        String tampered = parts[0] + ":" + parts[1] + ":" + flipped;
        assertThatThrownBy(() -> cipher.decrypt(tampered))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void anUnsupportedFormatIsRefused() {
        assertThatThrownBy(() -> cipher.decrypt("v9:abc:def"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aKeyThatIsNot32BytesIsRefusedAtConstruction() {
        assertThatThrownBy(() -> new AadhaarCipher(Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(IllegalStateException.class);
    }
}