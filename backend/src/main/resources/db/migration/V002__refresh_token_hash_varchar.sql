-- V002: refresh_tokens.token_hash CHAR(64) -> VARCHAR(64).
--
-- V001 used CHAR(64) for the SHA-256 hex digest. bpchar is a poor fit here:
-- it pads with spaces, and Hibernate's ddl-auto: validate maps a String
-- attribute to VARCHAR, so the fixed-width column failed schema validation.
-- The value is always exactly 64 characters, so nothing is lost by widening
-- the type. A new migration rather than an edit to V001, because V001 is
-- already applied in environments that must not see a checksum mismatch.
ALTER TABLE refresh_tokens ALTER COLUMN token_hash TYPE VARCHAR(64);