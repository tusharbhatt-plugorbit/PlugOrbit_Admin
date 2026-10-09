/**
 * The single place the browser talks to the Admin API.
 *  - attaches the Firebase/dev ID token
 *  - normalises every failure into ApiError / ApiTimeoutError / NetworkError
 *  - reports 401s once so the auth layer can end the session
 */
export type Query = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}
export class ApiTimeoutError extends Error {
  constructor() { super('The server took too long to respond.'); this.name = 'ApiTimeoutError'; }
}
export class NetworkError extends Error {
  constructor() { super('Could not reach the server.'); this.name = 'NetworkError'; }
}

type Hooks = { getToken: () => Promise<string | null>; onUnauthorized: (error: ApiError) => void };
let hooks: Hooks = { getToken: async () => null, onUnauthorized: () => {} };
export function configureHttp(next: Hooks): void { hooks = next; }

export const API_PREFIX = '/admin/v1';
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 15_000;

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `${BASE}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Public endpoints (/meta, dev-login) must not trigger the session-expiry flow. */
  anonymous?: boolean;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-PlugOrbit-Source': 'admin-web', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    const token = await hooks.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(buildUrl(path, opts.query), {
      method, headers, signal: controller.signal, cache: 'no-store',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (err) {
    if (timedOut) throw new ApiTimeoutError();
    if (opts.signal?.aborted) throw err; // caller cancelled: let useResource ignore it
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* non-JSON error body */ }

  if (!response.ok) {
    const detail = (payload as { detail?: Record<string, unknown> | string } | null)?.detail;
    const d = typeof detail === 'object' && detail !== null ? detail : {};
    const { code, message, fields, ...rest } = d as { code?: string; message?: string; fields?: Record<string, string> };
    const error = new ApiError(
      response.status,
      code ?? `HTTP_${response.status}`,
      message ?? (typeof detail === 'string' ? detail : `Request failed (${response.status}).`),
      fields,
      rest as Record<string, unknown>,
    );
    if (response.status === 401 && !opts.anonymous) hooks.onUnauthorized(error);
    throw error;
  }
  return payload as T;
}

export const http = {
  get: <T>(path: string, query?: Query, opts?: RequestOptions) => request<T>('GET', path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body: body ?? {} }),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
};

/** Human wording for any failure, like the mobile app's describeError. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Your role does not allow this.';
    if (error.status === 503 && error.code === 'AUTH_NOT_CONFIGURED') return 'Sign-in is not configured on the server yet.';
    return error.message;
  }
  if (error instanceof ApiTimeoutError) return 'The server took too long to answer. Please try again.';
  if (error instanceof NetworkError) return 'Cannot reach the PlugOrbit server. Check your connection and that the API is running.';
  return error instanceof Error ? error.message : 'Something went wrong.';
}
