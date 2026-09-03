import { useMemo, useState, type ReactNode } from 'react';
import { SessionContext, type DemoUser, type SessionValue } from './sessionContext';

/**
 * A stand-in for the session, not a security boundary.
 *
 * There is no auth in this build and there must not appear to be: the real
 * thing is server-side, tenant-scoped, and comes with the Spring Boot API.
 * This exists only so the login screen leads somewhere and the rail can show
 * a name. Anyone can reach any route by typing the URL, by design.
 */

const DEFAULT_USER: DemoUser = {
  name: 'Meenakshi Iyer',
  role: 'Fleet administrator',
  email: 'meenakshi@g1mobility.in',
};

const STORAGE_KEY = 'fleetech.demo.signedIn';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const value = useMemo<SessionValue>(
    () => ({
      user: DEFAULT_USER,
      tenant: 'G1 Mobility Rentals',
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
      },
    }),
    [signedIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
