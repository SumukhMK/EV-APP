import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IS_LIVE, setSessionExpiredHandler } from '../lib/api/client';
import { login as apiLogin, logout as apiLogout, me, type AuthUser } from '../lib/api/auth';
import { clearTokens, getRefreshToken, hasSession } from '../lib/api/tokens';
import { SessionContext, type DemoUser, type SessionValue } from './sessionContext';

/**
 * The session, in two modes that share one shape.
 *
 * With VITE_API_BASE set it is real: sign-in hits the API, the role comes off
 * a signed token, and a reload restores the session from the stored token.
 * Without it the demo behaviour is unchanged — any credentials sign in, and
 * the rail can switch personas to show what each role sees. Screens cannot
 * tell the difference, which is the point: nothing below this file changes
 * when a module is wired.
 */

/**
 * One account per role, matching the users fixture. The rail's persona switch
 * moves between these so a demo can show, on the spot, that a service manager
 * never sees the money screens and a fleet hand never sees the admin ones.
 *
 * Mock mode only — see SessionValue.personas.
 */
const PERSONAS: DemoUser[] = [
  { name: 'Meenakshi Iyer', roleKey: 'TENANT_ADMIN', email: 'meenakshi@g1mobility.in' },
  { name: 'Priya Menon', roleKey: 'SUPER_ADMIN', email: 'priya@g1mobility.in' },
  { name: 'Abhinandan', roleKey: 'SERVICE_MANAGER', email: 'abhinandan@g1mobility.in' },
  { name: 'Dhananjay', roleKey: 'FLEET_STAFF', email: 'dhananjay@g1mobility.in' },
];

const STORAGE_KEY = 'fleetech.demo.signedIn';
const DEMO_TENANT = 'G1 Mobility Rentals';

function toDemoUser(user: AuthUser): DemoUser {
  return { name: user.name, roleKey: user.role, email: user.email };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return IS_LIVE ? <LiveSession>{children}</LiveSession> : <MockSession>{children}</MockSession>;
}

function LiveSession({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // A stored token is only a claim to a session. It stays a claim until
  // /auth/me agrees, so first load starts as restoring, not as signed in.
  const [restoring, setRestoring] = useState(() => hasSession());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasSession()) return;
    me()
      .then((restored) => {
        if (alive.current) setUser(restored);
      })
      .catch(() => {
        // Expired, revoked, or the user is gone. Drop it rather than keep a
        // token that will fail the next real call.
        clearTokens();
      })
      .finally(() => {
        if (alive.current) setRestoring(false);
      });
  }, []);

  // The client cannot navigate, so it reports a dead session here instead.
  // Without this, a refresh that fails mid-session leaves the rail drawn
  // around screens whose every request is now a 401.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await apiLogin(email, password));
  }, []);

  const signOut = useCallback(() => {
    const refreshToken = getRefreshToken();
    // Local state first: the user asked to leave and should not wait on the
    // network to do it. The call still revokes the token server-side.
    setUser(null);
    void apiLogout(refreshToken);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user: user ? toDemoUser(user) : PERSONAS[0],
      tenant: user?.tenantName ?? '',
      personas: [],
      signedIn: user !== null,
      restoring,
      signIn,
      signOut,
      switchPersona: () => {},
    }),
    [user, restoring, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function MockSession({ children }: { children: ReactNode }) {
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
      tenant: DEMO_TENANT,
      personas: PERSONAS,
      signedIn,
      restoring: false,
      signIn: async () => {
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
