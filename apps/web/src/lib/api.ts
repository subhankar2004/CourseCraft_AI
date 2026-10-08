import type { ZodType } from 'zod';

/**
 * Thin, typed wrapper around fetch for the CourseCraft API (apps/api).
 * - Sends cookies (`credentials: 'include'`) for the httpOnly JWT session (#9).
 * - Throws ApiError carrying the API's standard error body (see apps/api AllExceptionsFilter).
 * - Optionally validates the response with a Zod schema (shared schemas arrive in #6).
 */

// Must be referenced literally so Next.js can inline it into the browser bundle.
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** Mirrors the API's error response shape. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(body: ApiErrorBody) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.body = body;
  }

  get requestId(): string | undefined {
    return this.body.requestId;
  }
}

export interface ApiRequestOptions<T> extends Omit<RequestInit, 'body'> {
  /** JSON-serialised as the request body. */
  json?: unknown;
  /** Validates (and types) the response body. */
  schema?: ZodType<T>;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // e.g. an HTML error page from a proxy
  }
}

export function apiUrl(path: string): string {
  if (!API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env at the repo root.');
  }
  return `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function api<T = unknown>(
  path: string,
  options: ApiRequestOptions<T> = {},
): Promise<T> {
  const { json, schema, headers, ...init } = options;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(json !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch (cause) {
    // Network failure, CORS rejection, or API down.
    throw new ApiError({ statusCode: 0, error: 'Network Error', message: String(cause) });
  }

  const data = parseJson(await response.text());

  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError({
      statusCode: response.status,
      error: body.error ?? response.statusText,
      message: body.message ?? response.statusText,
      path: body.path,
      timestamp: body.timestamp,
      requestId: body.requestId ?? response.headers.get('x-request-id') ?? undefined,
    });
  }

  return schema ? schema.parse(data) : (data as T);
}
