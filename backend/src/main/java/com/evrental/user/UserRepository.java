package com.evrental.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Login lookup by email. The email is globally unique (V001 indexes
     * {@code lower(email)}), so this is only ever called under the super-admin
     * sentinel — the auth module sets {@code app.tenant_id = '*'} on its
     * transaction first, or RLS would hide every row.
     *
     * <p>Written out rather than derived from the method name. Spring Data
     * renders {@code ...IgnoreCase} as {@code UPPER(email) = UPPER(?)}, which
     * does not match an index built on {@code lower(email)} — the lookup would
     * fall back to a sequential scan of every user in the platform, on the one
     * query that runs before a caller has authenticated.
     */
    @Query("select u from User u where lower(u.email) = lower(:email)")
    Optional<User> findByEmailIgnoreCase(@Param("email") String email);
}
