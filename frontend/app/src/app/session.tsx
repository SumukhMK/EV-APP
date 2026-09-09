import { useMemo, useState, type ReactNode } from 'react';
import { SessionContext, type DemoUser, type SessionValue } from './sessionContext';

/**
 * A stand-in for the session, not a security boundary.
 *
 * There is no auth in this build and there must not appear to be: the real
 * thing is server-side, tenant-scoped, and comes with the Spring Boot API.
 * This exists only so the login screen leads somewhere and the rail can show
 * a name — and so a walkthrough can switch personas to show what each role
 * sees. Anyone can still reach any route by typing the URL, by design.
 */

/**
 * One account per role, matching the users fixture. The rail's persona switch
 * moves between these so a demo can show, on the spot, that a service manager
 * never sees the money screens and a fleet hand never sees the admin ones.
 */
const PERSONAS: DemoUser[] = [
  { name: 'Meenakshi Iyer', roleKey: 'TENANT_ADMIN', email: 'meenakshi@g1mobility.in' },
  { name: 'Priya Menon', roleKey: 'SUPER_ADMIN', email: 'priya@g1mobility.in' },
  { name: 'Abhinandan', roleKey: 'SERVICE_MANAGER', email: 'abhinandan@g1mobility.in' },
  { name: 'Dhananjay', roleKey: 'FLEET_STAFF', email: 'dhananjay@g1mobility.in' },
];

const STORAGE_KEY = 'fleetech.demo.signedIn';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // The persona is deliberately NOT persisted. It is a live walkthrough tool,
  // so every fresh load starts on the full-access admin and no screen is ever
  // silently missing from the rail after a reload — switching to a narrower
  // role only lasts for the current view, and reloading brings everything back.
  const [personaEmail, setPersonaEmail] = useState(PERSONAS[0].email);

  const user = PERSONAS.find((p) => p.email === personaEmail) ?? PERSONAS[0];

  const value = useMemo<SessionValue>(
    () => ({
      user,
      tenant: 'G1 Mobility Rentals',
      personas: PERSONAS,
      signedIn,
      signIn: () => {
        try {
          sessionStorage.setItem(STORAGE_KEY, '1');
        } catch {
          // Private mode — the demo still works, it just re-prompts.
        }
        setSignedIn(true);
      },
      signOut: () => {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // Nothing to clean up.
        }
        setSignedIn(false);
        // Back to the default admin, so the next sign-in is never stuck in a
        // narrowed role a previous session left behind.
        setPersonaEmail(PERSONAS[0].email);
      },
      switchPersona: (email: string) => setPersonaEmail(email),
    }),
    [user, signedIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
