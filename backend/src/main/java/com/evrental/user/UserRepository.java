package com.evrental.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Login lookup by email. The email is globally unique (V001 indexes
     * lower(email)), so this is only ever called under the super-admin
     * sentinel — the auth module sets {@code app.tenant_id = '*'} on its
     * transaction first, or RLS would hide every row.
     */
    Optional<User> findByEmailIgnoreCase(String email);
}