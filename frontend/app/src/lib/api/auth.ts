import type { User } from '../../types';
import { request } from './client';
import { clearTokens, setTokens } from './tokens';

/**
 * The real auth calls (S0). Unlike every other module here there is no mock
 * twin: a fake login has nothing to authenticate against, and the mock build
 * signs in without asking the server anything at all.
 */

/**
 * The signed-in user. It is `User` plus the operator's name, which only the
 * auth endpoints return — on a user list every row shares the caller's tenant,
 * so repeating it per row would say nothing.
 */
export interface AuthUser extends User {
  tenantName: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Exchanges credentials for a token pair.
 *
 * `anonymous` because there is no session yet to refresh — without it a wrong
 * password would trigger a refresh attempt on the way to reporting itself.
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  const body = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });
  setTokens(body.accessToken, body.refreshToken);
  return body.user;
}

/**
 * Ends the session server-side, then locally.
 *
 * The local clear happens even if the call fails. A logout that leaves the
 * tokens in place because the network blipped is the one failure mode a logout
 * must not have.
 */
export async function logout(refreshToken: string | null): Promise<void> {
  try {
    await request<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    });
  } catch {
    // Already expired, or unreachable. Either way the session ends here.
  } finally {
    clearTokens();
  }
}

/** Who the stored token belongs to — used to restore a session on reload. */
export function me(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}
