import { API_BASE, USE_MOCKS } from '../lib/env';
import { clearSession, getToken } from '../auth/session';
import type { ProblemDetails } from './types';

/** Typed error for every non-2xx response, built from RFC 7807 problem details. */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly type?: string;
  readonly errors: Record<string, string[]>;

  constructor(status: number, problem: ProblemDetails) {
    const title = problem.title || defaultTitle(status);
    super(problem.detail || title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = problem.detail;
    this.type = problem.type;
    this.errors = problem.errors ?? {};
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
  get isValidation(): boolean {
    return this.status === 422 || this.status === 400;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
  /** Flattened field messages, for forms. */
  fieldMessages(): string[] {
    return Object.entries(this.errors).flatMap(([field, msgs]) => msgs.map((m) => `${field}: ${m}`));
  }
}

export function defaultTitle(status: number): string {
  switch (status) {
    case 0:
      return 'Cannot reach the Kratos API';
    case 400:
      return 'The request was not valid';
    case 401:
      return 'Your session has ended';
    case 403:
      return 'You do not have access to this';
    case 404:
      return 'Not found';
    case 409:
      return 'Someone else changed this';
    case 413:
      return 'The file is too large';
    case 422:
      return 'Some fields need attention';
    case 429:
      return 'Too many attempts. Please wait and try again';
    default:
      return status >= 500 ? 'The server had a problem' : `Request failed (${status})`;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchOverride: FetchLike | null = null;
let mockFetchPromise: Promise<FetchLike> | null = null;

/** Tests can inject a fake fetch. Pass null to restore the default. */
export function setFetchImplementation(impl: FetchLike | null): void {
  fetchOverride = impl;
}

async function resolveFetch(): Promise<FetchLike> {
  if (fetchOverride) return fetchOverride;
  if (USE_MOCKS) {
    mockFetchPromise ??= import('./mocks/mockFetch').then((m) => m.mockFetch);
    return mockFetchPromise;
  }
  return (input, init) => fetch(input, init);
}

let unauthorizedHandler: () => void = () => {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?expired=1&next=${next}`);
  }
};

/** The router registers a softer redirect (no full reload) at start-up. */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  formData?: FormData;
  signal?: AbortSignal;
  /** For the login call: a 401 there means bad credentials, not an expired session. */
  anonymous?: boolean;
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseProblem(res: Response): Promise<ProblemDetails> {
  const type = res.headers.get('content-type') ?? '';
  try {
    if (type.includes('json')) {
      const body = (await res.json()) as unknown;
      if (body && typeof body === 'object') return body as ProblemDetails;
    } else {
      const text = await res.text();
      if (text && text.length < 500) return { detail: text };
    }
  } catch {
    /* fall through to empty problem */
  }
  return {};
}

async function send(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = opts.anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const doFetch = await resolveFetch();
  let res: Response;
  try {
    res = await doFetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, { detail: 'Check your connection, or that the API is running.' });
  }

  if (res.ok) return res;

  const problem = await parseProblem(res);
  if (res.status === 401 && !opts.anonymous) {
    clearSession();
    unauthorizedHandler();
  }
  throw new ApiError(res.status, { ...problem, status: res.status });
}

export async function request<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
  const res = await send(method, path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, { query }),
  upload: <T>(path: string, formData: FormData) => request<T>('POST', path, { formData }),
};

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

export function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* ignore */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/** Fetch a file with the auth header and return it as a blob (no token in URLs). */
export async function download(path: string, fallbackName: string): Promise<DownloadedFile> {
  const res = await send('GET', path);
  const blob = await res.blob();
  return { blob, fileName: fileNameFromDisposition(res.headers.get('content-disposition'), fallbackName) };
}

/** Trigger a browser save for a blob via a short-lived object URL. */
export function saveBlob({ blob, fileName }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
