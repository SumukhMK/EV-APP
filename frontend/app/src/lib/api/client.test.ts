import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setSessionExpiredHandler } from './client';
import { clearTokens, getAccessToken, setTokens } from './tokens';

/** A Response stand-in — jsdom has no fetch, so everything here is stubbed. */
function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  clearTokens();
  fetchMock.mockReset();
  setSessionExpiredHandler(null);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('sends the access token and returns the parsed body', async () => {
    setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(json({ id: 'BLRSS0428' }));

    const result = await request<{ id: string }>('/vehicles/BLRSS0428');

    expect(result).toEqual({ id: 'BLRSS0428' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer access-1');
  });

  it('drops blank filters rather than sending them as values', async () => {
    fetchMock.mockResolvedValueOnce(json({ content: [] }));

    await request('/vehicles', { query: { q: '', state: 'DEPLOYED', hub: undefined, page: 0 } });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('state=DEPLOYED');
    expect(url).toContain('page=0');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('hub');
  });

  it('turns an error body into an ApiError that keeps the field', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ message: 'A vehicle with this id already exists', status: 409, field: 'id' }, 409),
    );

    await expect(request('/vehicles', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      field: 'id',
      message: 'A vehicle with this id already exists',
    });
  });

  it('still produces a printable error when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(request('/vehicles')).rejects.toBeInstanceOf(ApiError);
  });

  it('refreshes once on a 401 and retries the original call', async () => {
    setTokens('expired', 'refresh-1');
    fetchMock
      .mockResolvedValueOnce(json({ message: 'Unauthorized', status: 401 }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'access-2', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(json({ id: 'BLRSS0428' }));

    const result = await request<{ id: string }>('/vehicles/BLRSS0428');

    expect(result).toEqual({ id: 'BLRSS0428' });
    expect(getAccessToken()).toBe('access-2');
    // The retry carries the new token, not the expired one.
    const [, retryInit] = fetchMock.mock.calls[2];
    expect(retryInit.headers.Authorization).toBe('Bearer access-2');
  });

  it('refreshes only once when several calls hit a 401 together', async () => {
    setTokens('expired', 'refresh-1');
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (String(url).endsWith('/auth/refresh')) {
        return json({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      }
      const headers = (init.headers ?? {}) as Record<string, string>;
      return headers.Authorization === 'Bearer access-2'
        ? json({ ok: true })
        : json({ message: 'Unauthorized', status: 401 }, 401);
    });

    await Promise.all([
      request('/vehicles'),
      request('/vehicles/facets'),
      request('/vehicles/filter-options'),
    ]);

    // Rotation makes a second refresh fatal: it would present a token the
    // first refresh already burned.
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session and notifies when the refresh itself fails', async () => {
    setTokens('expired', 'stale-refresh');
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock
      .mockResolvedValueOnce(json({ message: 'Unauthorized', status: 401 }, 401))
      .mockResolvedValueOnce(json({ message: 'Refresh token expired', status: 401 }, 401));

    await expect(request('/vehicles')).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
  });

  it('does not try to refresh an anonymous call', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Bad credentials', status: 401 }, 401));

    await expect(
      request('/auth/login', { method: 'POST', body: {}, anonymous: true }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns nothing for a 204 instead of trying to parse a body', async () => {
    setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      json: async () => {
        throw new Error('no body');
      },
    } as unknown as Response);

    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('lets the browser set the multipart boundary on a file upload', async () => {
    setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(json({ importId: 'abc' }));

    await request('/vehicles/imports', {
      method: 'POST',
      file: new File(['id,chassisNumber\n'], 'vehicles.csv', { type: 'text/csv' }),
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
  });
});
