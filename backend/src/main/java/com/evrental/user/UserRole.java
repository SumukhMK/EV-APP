package com.evrental.user;

/**
 * The four roles from frontend/app/src/types/user.ts, which is the contract of
 * record. (ARCHITECTURE.md still names an older three-role set; the types file
 * is newer and the screens are built against it.)
 */
public enum UserRole {
    SUPER_ADMIN,
    FLEET_ADMIN,
    FLEET_STAFF,
    SERVICE_MANAGER
}