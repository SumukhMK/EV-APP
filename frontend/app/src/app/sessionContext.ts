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
   * each role's view without a real login. */
  personas: DemoUser[];
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
  switchPersona: (email: string) => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
