package com.evrental.common;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Encrypts and decrypts Aadhaar numbers at rest.
 *
 * <p>AES-256-GCM: a fresh random 12-byte IV per value, a 128-bit
 * authentication tag, and a 256-bit key that lives only in the
 * {@code AADHAAR_ENCRYPTION_KEY} environment variable — never in the database,
 * never in a response, never in a log. The stored form is self-describing so
 * the format can evolve (and keys can rotate) without a migration:
 * {@code v1:<base64(iv)>:<base64(ciphertext||tag)>}.
 *
 * <p>The key has no default in application.yml, on purpose: a key committed to
 * a repository is a key everyone has. A deployment that forgets it fails at
 * boot, not at the first onboard.
 *
 * <p>Nothing on the wire ever returns the plaintext. decrypt() exists for the
 * day a KYC verification step needs to compare against the stored number, and
 * for the tests that prove the register stores ciphertext, not the number.
 */
@Component
public class AadhaarCipher {

    private static final String VERSION = "v1";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key;

    public AadhaarCipher(@Value("${app.aadhaar-encryption-key}") String base64Key) {
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(base64Key);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(
                    "AADHAAR_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256)", e);
        }
        if (decoded.length != 32) {
            throw new IllegalStateException(
                    "AADHAAR_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256)");
        }
        this.key = new SecretKeySpec(decoded, "AES");
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_BYTES];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return VERSION + ":" + Base64.getEncoder().encodeToString(iv) + ":"
                    + Base64.getEncoder().encodeToString(ciphertext);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not encrypt Aadhaar", e);
        }
    }

    public String decrypt(String stored) {
        try {
            String[] parts = stored.split(":", 3);
            if (parts.length != 3 || !VERSION.equals(parts[0])) {
                throw new IllegalArgumentException("Unsupported Aadhaar ciphertext");
            }
            byte[] iv = Base64.getDecoder().decode(parts[1]);
            byte[] ciphertext = Base64.getDecoder().decode(parts[2]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not decrypt Aadhaar", e);
        }
    }
}