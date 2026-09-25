/**
 * Where the session's tokens live between requests.
 *
 * sessionStorage, not localStorage: this is a fleet operations console, often
 * on a shared machine at a hub, and a token that dies with the tab is the
 * right default. It still survives a reload, which is the only persistence the
 * screens ever actually relied on.
 *
 * The access token is also held in a module variable so the common path does
 * not touch storage on every request. Storage is the backup, read once on
 * load; the variable is the truth while the tab is open.
 */

const ACCESS_KEY = 'fleetech.auth.access';
const REFRESH_KEY = 'fleetech.auth.refresh';

let accessToken: string | null = read(ACCESS_KEY);
let refreshToken: string | null = read(REFRESH_KEY);

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled. The session still works, it just does
    // not survive a reload.
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // As above — in-memory only.
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  write(ACCESS_KEY, access);
  write(REFRESH_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  write(ACCESS_KEY, null);
  write(REFRESH_KEY, null);
}

export function hasSession(): boolean {
  return accessToken !== null && refreshToken !== null;
}
