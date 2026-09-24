/**
 * The seam between the UI and the backend.
 *
 * Two halves live here. `delay` and `paginate` serve the modules that still
 * resolve from src/mocks — riders, service jobs, payments, assignments, users,
 * audit — because S2 to S6 do not exist yet. `request` serves the modules that
 * have a backend: auth (S0) and vehicles (S1).
 *
 * Both halves run in the same app on purpose. That is not a transitional hack;
 * it is the steady state until S6 lands, and each stage flips exactly one
 * module across by swapping which implementation its facade re-exports.
 */

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens';

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

/**
 * Whether this build talks to a real API.
 *
 * Deliberately derived from VITE_API_BASE rather than a second flag: two
 * switches that must agree eventually disagree. If you pointed the app at an
 * API, you meant it. Tests set nothing, so they resolve to the mocks.
 */
export const IS_LIVE = Boolean(import.meta.env.VITE_API_BASE);

/** Network-ish latency, so loading and empty states are real, not theoretical. */
const LATENCY_MS = 220;

export function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class ApiError extends Error {
  status: number;
  /** Set when the failure belongs to one form field, so RHF can attach it. */
  field?: string;

  constructor(message: string, status: number, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

/** Shared paging over an in-memory array, matching Spring's Page shape. */
export function paginate<T>(all: T[], page = 0, size = 12) {
  const start = page * size;
  return {
    content: all.slice(start, start + size),
    page,
    size,
    totalElements: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / size)),
  };
}

// ---------------------------------------------------------------------------
// The live half
// ---------------------------------------------------------------------------

/** Called when a refresh fails, so the app can send the user back to login. */
type ExpiryListener = () => void;
let onExpired: ExpiryListener | null = null;

export function setSessionExpiredHandler(handler: ExpiryListener | null) {
  onExpired = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Sent as multipart. Used by the CSV import, which posts a file, not JSON. */
  file?: File;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Auth calls that must not try to refresh — refreshing is what they do. */
  anonymous?: boolean;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // A blank filter means "do not filter", and the server reads a missing
    // parameter exactly that way. Sending `state=` instead would be a value.
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Turns a failed response into an ApiError, preserving `field`.
 *
 * The backend answers every error as ApiErrorResponse { message, status,
 * field }, and the forms already read `field` to attach a message to the right
 * input. A body that is not that shape — a proxy's HTML 502, say — must still
 * produce something a screen can print.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  let field: string | undefined;
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') message = body.message;
    if (body && typeof body.field === 'string') field = body.field;
  } catch {
    // Not JSON. Keep the status-based message.
  }
  return new ApiError(message, response.status, field);
}

/**
 * One shared refresh, however many callers hit a 401 at once.
 *
 * Refresh tokens rotate: using one burns it. A dashboard fires several queries
 * together, so on an expired access token each would start its own refresh,
 * and every one after the first would present a token the first had already
 * consumed — the user gets thrown to the login screen mid-session. Holding the
 * in-flight promise means the second, third and fourth callers await the same
 * refresh instead of racing it.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const attempt = (async () => {
    const token = getRefreshToken();
    if (!token) return false;
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!response.ok) return false;
      const body = await response.json();
      setTokens(body.accessToken, body.refreshToken);
      return true;
    } catch {
      return false;
    }
  })();

  // Cleared however it settles, so the next 401 starts a fresh attempt rather
  // than awaiting a promise that resolved to false minutes ago.
  refreshInFlight = attempt.finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, file, query, anonymous = false } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token && !anonymous) headers.Authorization = `Bearer ${token}`;

    let payload: BodyInit | undefined;
    if (file) {
      // No Content-Type: the browser must set it so the multipart boundary is
      // included. Setting it by hand is the classic way to break an upload.
      const form = new FormData();
      form.append('file', file);
      payload = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    return fetch(buildUrl(path, query), { method, headers, body: payload });
  };

  let response = await send();

  if (response.status === 401 && !anonymous) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await send();
    } else {
      clearTokens();
      onExpired?.();
      throw await toApiError(response);
    }
  }

  if (!response.ok) throw await toApiError(response);

  // 204, and any other body-less success.
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return (await response.json()) as T;
}
