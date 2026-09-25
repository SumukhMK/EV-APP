import { createContext, useContext } from 'react';
import type { UserRole } from '../types';

/**
 * Context and hook live apart from the provider component so the module that
 * exports the provider exports only components — otherwise Fast Refresh
 * remounts the whole tree on every edit to this file.
 */

export interface DemoUser {
  name: string;
  /** Drives which nav sections the rail shows. Not a security boundary. */
  roleKey: UserRole;
  email: string;
}

export interface SessionValue {
  user: DemoUser;
  tenant: string;
  /** The demo personas the rail can switch between, so a walkthrough can show
   * each role's view without a real login. Empty when the API is live: the
   * role comes from a signed token, and a control that looks like it changes
   * your role but does not is worse than no control at all. */
  personas: DemoUser[];
  signedIn: boolean;
  /** True while a stored token is being exchanged for its user on first load.
   * Routing must wait on it, or a reload bounces a signed-in user to /login. */
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  switchPersona: (email: string) => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
