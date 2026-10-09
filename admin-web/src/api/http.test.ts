import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiTimeoutError, NetworkError, buildUrl, configureHttp, describeError, http } from './http';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('http client', () => {
  const onUnauthorized = vi.fn();
  beforeEach(() => {
    onUnauthorized.mockReset();
    configureHttp({ getToken: async () => 'tok-123', onUnauthorized });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('builds URLs under /admin/v1 and drops empty query values', () => {
    expect(buildUrl('/stations', { q: 'delhi', status: '', limit: 10, x: undefined })).toBe('/admin/v1/stations?q=delhi&limit=10');
  });

  it('sends the bearer token and the source header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }));
    await http.get('/overview');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect((init.headers as Record<string, string>)['X-PlugOrbit-Source']).toBe('admin-web');
  });

  it('does not send credentials on anonymous calls (meta, dev sign-in)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, {}));
    await http.get('/meta', undefined, { anonymous: true });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('turns the API error envelope into an ApiError with code, message and field errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(422, { detail: { code: 'VALIDATION_ERROR', message: 'PAN must look like ABCDE1234F.', fields: { pan: 'PAN must look like ABCDE1234F.' } } }));
    const err = await http.post('/partners', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'VALIDATION_ERROR', fields: { pan: expect.any(String) } });
  });

  it('keeps extra details (e.g. the failing go-live checks) on the error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(409, { detail: { code: 'NOT_READY', message: 'x', failing: ['Every connector has a price'] } }));
    const err = (await http.post('/stations/s/publish').catch((e) => e)) as ApiError;
    expect(err.details.failing).toEqual(['Every connector has a price']);
  });

  it('reports a 401 once so the session can end, and still throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(401, { detail: { code: 'TOKEN_EXPIRED', message: 'Session expired.' } }));
    await expect(http.get('/overview')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not trigger session expiry for an anonymous 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(401, { detail: { code: 'X', message: 'no' } }));
    await expect(http.get('/meta', undefined, { anonymous: true })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('maps a network failure to NetworkError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(http.get('/overview')).rejects.toBeInstanceOf(NetworkError);
  });

  it('maps a slow server to ApiTimeoutError', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_u, init) => new Promise((_res, rej) => { (init as RequestInit).signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }));
    const pending = http.get('/overview', undefined, { timeoutMs: 1000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toBeInstanceOf(ApiTimeoutError);
  });

  it('returns undefined for 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(http.delete('/connectors/x')).resolves.toBeUndefined();
  });

  it('describes failures in plain words', () => {
    expect(describeError(new ApiError(403, 'FORBIDDEN', 'x'))).toBe('Your role does not allow this.');
    expect(describeError(new ApiTimeoutError())).toMatch(/too long/);
    expect(describeError(new NetworkError())).toMatch(/Cannot reach/);
    expect(describeError(new ApiError(409, 'STALE_VERSION', 'Someone else changed this'))).toBe('Someone else changed this');
  });
});
