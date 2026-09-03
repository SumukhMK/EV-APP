import { createContext, useContext } from 'react';

/**
 * Context and hook live apart from the provider component so the module that
 * exports the provider exports only components — otherwise Fast Refresh
 * remounts the whole tree on every edit to this file.
 */

export interface DemoUser {
  name: string;
  role: string;
  email: string;
}

export interface SessionValue {
  user: DemoUser;
  tenant: string;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
