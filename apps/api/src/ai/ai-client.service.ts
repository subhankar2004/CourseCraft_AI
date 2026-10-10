import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  aiHealthSchema,
  deleteVectorsResponseSchema,
  errorResponseSchema,
  ingestMetadataResponseSchema,
  ingestTranscriptResponseSchema,
  processLessonResponseSchema,
  structureResponseSchema,
  vectorSearchResponseSchema,
  type AiHealth,
  type DeleteVectorsResponse,
  type IngestMetadataRequest,
  type IngestMetadataResponse,
  type IngestTranscriptRequest,
  type IngestTranscriptResponse,
  type ProcessLessonRequest,
  type ProcessLessonResponse,
  type StructureRequest,
  type StructureResponse,
  type VectorSearchRequest,
  type VectorSearchResponse,
} from '@coursecraft/shared';
import type { z } from 'zod';
import { AiServiceError, type AiErrorKind } from './ai-client.errors.js';
import { parseSse, type SseEvent } from './sse.js';

/** Per-endpoint limits. Long timeouts are deliberate: notes from a local LLM take minutes. */
export const ENDPOINTS = {
  health: { timeoutMs: 3_000, retries: 0, retryTimeouts: false },
  ingestMetadata: { timeoutMs: 120_000, retries: 2, retryTimeouts: true },
  // Whisper may transcribe up to WHISPER_MAX_MINUTES of audio (~25× real time on a laptop).
  ingestTranscript: { timeoutMs: 15 * 60_000, retries: 1, retryTimeouts: false },
  // Map-reduce notes for a long lecture on a local model: ~10-15 min.
  processLesson: { timeoutMs: 30 * 60_000, retries: 1, retryTimeouts: false },
  processStructure: { timeoutMs: 5 * 60_000, retries: 2, retryTimeouts: true },
  vectors: { timeoutMs: 30_000, retries: 2, retryTimeouts: true },
  stream: { timeoutMs: 30_000, retries: 1, retryTimeouts: true },
} as const;
export type EndpointName = keyof typeof ENDPOINTS;
type Limits = { timeoutMs: number; retries: number; retryTimeouts: boolean };

/** No data from a stream for this long ends it (the AI service sends keep-alives). */
const STREAM_IDLE_MS = 60_000;
const MAX_RETRY_AFTER_MS = 30_000;

export interface CallOptions {
  /** Forwarded as X-Request-Id (logged by the AI service on every line). Generated if absent. */
  requestId?: string;
  /** Cancels the call (e.g. the browser disconnected). */
  signal?: AbortSignal;
}

export interface AiClientOptions {
  baseUrl: string;
  internalKey: string;
  fetch?: typeof fetch;
  /** Waits between retries; replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** First backoff delay; doubles per attempt, with jitter. */
  baseDelayMs?: number;
  /** Override limits (tests). */
  limits?: Partial<Record<EndpointName, Partial<Limits>>>;
}

interface Attempt {
  response: Response;
  /** Stops the timeout. */
  release: () => void;
  /** Stops the timeout and unlinks the caller's signal. */
  detach: () => void;
}

interface Request<T> {
  endpoint: EndpointName;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  schema: z.ZodType<T>;
}

/**
 * Typed client for the internal AI service (SPEC §8.2). Every call sends `X-Internal-Key` and
 * `X-Request-Id`, has a per-endpoint timeout, retries outages with exponential backoff (honouring
 * `Retry-After`), and validates the response against the shared contract.
 */
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseDelayMs: number;

  constructor(private readonly options: AiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
  }

  // ─── Endpoints ──────────────────────────────────────────────────────────────

  health(options?: CallOptions): Promise<AiHealth> {
    return this.call(
      { endpoint: 'health', method: 'GET', path: '/health', schema: aiHealthSchema },
      options,
    );
  }

  ingestMetadata(
    body: IngestMetadataRequest,
    options?: CallOptions,
  ): Promise<IngestMetadataResponse> {
    return this.call(
      {
        endpoint: 'ingestMetadata',
        method: 'POST',
        path: '/ingest/metadata',
        body,
        schema: ingestMetadataResponseSchema,
      },
      options,
    );
  }

  ingestTranscript(
    body: IngestTranscriptRequest,
    options?: CallOptions,
  ): Promise<IngestTranscriptResponse> {
    return this.call(
      {
        endpoint: 'ingestTranscript',
        method: 'POST',
        path: '/ingest/transcript',
        body,
        schema: ingestTranscriptResponseSchema,
      },
      options,
    );
  }

  processLesson(body: ProcessLessonRequest, options?: CallOptions): Promise<ProcessLessonResponse> {
    return this.call(
      {
        endpoint: 'processLesson',
        method: 'POST',
        path: '/process/lesson',
        body,
        schema: processLessonResponseSchema,
      },
      options,
    );
  }

  processStructure(body: StructureRequest, options?: CallOptions): Promise<StructureResponse> {
    return this.call(
      {
        endpoint: 'processStructure',
        method: 'POST',
        path: '/process/structure',
        body,
        schema: structureResponseSchema,
      },
      options,
    );
  }

  searchVectors(
    courseId: string,
    body: VectorSearchRequest,
    options?: CallOptions,
  ): Promise<VectorSearchResponse> {
    return this.call(
      {
        endpoint: 'vectors',
        method: 'POST',
        path: `/vectors/${encodeURIComponent(courseId)}/search`,
        body,
        schema: vectorSearchResponseSchema,
      },
      options,
    );
  }

  deleteCourseVectors(courseId: string, options?: CallOptions): Promise<DeleteVectorsResponse> {
    return this.call(
      {
        endpoint: 'vectors',
        method: 'DELETE',
        path: `/vectors/${encodeURIComponent(courseId)}`,
        schema: deleteVectorsResponseSchema,
      },
      options,
    );
  }

  deleteLessonVectors(
    courseId: string,
    lessonId: string,
    options?: CallOptions,
  ): Promise<DeleteVectorsResponse> {
    const path = `/vectors/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;
    return this.call(
      { endpoint: 'vectors', method: 'DELETE', path, schema: deleteVectorsResponseSchema },
      options,
    );
  }

  /**
   * POSTs to a streaming endpoint and yields its Server-Sent Events (passthrough for chat, #41).
   * Connecting is retried like other calls; once events flow, a failure ends the stream with an
   * AiServiceError (it can't be replayed). Ends after STREAM_IDLE_MS without data.
   */
  async *stream(path: string, body: unknown, options?: CallOptions): AsyncGenerator<SseEvent> {
    const requestId = options?.requestId ?? newRequestId();
    const { response, release, detach } = await this.withRetries(
      'stream',
      path,
      requestId,
      options?.signal,
      (signal) => this.send('POST', path, body, requestId, signal, 'text/event-stream'),
    );
    release(); // the connect timeout is over; the idle timeout below takes over
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/event-stream') || response.body === null) {
      detach();
      await response.body?.cancel();
      throw new AiServiceError(
        'contract',
        `expected an event stream, got '${contentType}'`,
        path,
        requestId,
        response.status,
      );
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const chunks = async function* (): AsyncGenerator<string> {
      try {
        for (;;) {
          let timer: NodeJS.Timeout | undefined;
          const idle = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new AiServiceError(
                    'timeout',
                    `stream idle for ${STREAM_IDLE_MS} ms`,
                    path,
                    requestId,
                  ),
                ),
              STREAM_IDLE_MS,
            );
          });
          try {
            const { done, value } = await Promise.race([reader.read(), idle]);
            if (done) return;
            yield value;
          } finally {
            clearTimeout(timer);
          }
        }
      } catch (error) {
        if (error instanceof AiServiceError) throw error;
        throw classifyThrown(error, path, requestId, options?.signal);
      } finally {
        detach();
        await reader.cancel().catch(() => undefined);
      }
    };
    yield* parseSse(chunks());
  }

  // ─── Plumbing ───────────────────────────────────────────────────────────────

  private async call<T>(request: Request<T>, options?: CallOptions): Promise<T> {
    const requestId = options?.requestId ?? newRequestId();
    const label = `${request.method} ${request.path}`;
    const started = performance.now();
    const { response, detach } = await this.withRetries(
      request.endpoint,
      label,
      requestId,
      options?.signal,
      (signal) => this.send(request.method, request.path, request.body, requestId, signal),
    );
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AiServiceError(
          'contract',
          'response is not JSON',
          label,
          requestId,
          response.status,
          {
            cause: error,
          },
        );
      }
      throw classifyThrown(error, label, requestId, options?.signal); // timeout or abort mid-body
    } finally {
      detach();
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new AiServiceError(
        'contract',
        `unexpected response: ${issues.join('; ')}`,
        label,
        requestId,
        response.status,
      );
    }
    this.logger.log(
      `AI ${label} → ${response.status} in ${Math.round(performance.now() - started)} ms (requestId ${requestId})`,
    );
    return parsed.data;
  }

  /**
   * Runs `attempt` until it returns a 2xx response, retrying what is retryable. The timeout keeps
   * running until the caller calls `release()` (after reading the body; after the headers for a
   * stream), so a slow body counts too while a long stream is not cut off.
   */
  private async withRetries(
    endpoint: EndpointName,
    label: string,
    requestId: string,
    callerSignal: AbortSignal | undefined,
    attempt: (signal: AbortSignal) => Promise<Response>,
  ): Promise<Attempt> {
    const limits: Limits = { ...ENDPOINTS[endpoint], ...this.options.limits?.[endpoint] };
    for (let n = 0; ; n++) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('timed out', 'TimeoutError')),
        limits.timeoutMs,
      );
      const onCallerAbort = () => controller.abort(callerSignal?.reason);
      if (callerSignal?.aborted) onCallerAbort();
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
      const release = () => clearTimeout(timer);
      const detach = () => {
        release();
        callerSignal?.removeEventListener('abort', onCallerAbort);
      };

      let error: AiServiceError;
      let retryAfterMs: number | undefined;
      try {
        const response = await attempt(controller.signal);
        if (response.ok) return { response, release, detach };
        error = await errorFromResponse(response, label, requestId);
        retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      } catch (thrown) {
        error = classifyThrown(thrown, label, requestId, callerSignal);
      }
      detach();
      const retry =
        n < limits.retries &&
        (error.kind === 'unavailable' || (error.kind === 'timeout' && limits.retryTimeouts));
      if (!retry) {
        this.logger.warn(
          `AI ${label} failed (${error.kind}): ${error.message} (requestId ${requestId})`,
        );
        throw error;
      }
      const delay = retryAfterMs ?? this.backoff(n);
      this.logger.warn(
        `AI ${label} ${error.kind}; retry ${n + 1}/${limits.retries} in ${delay} ms (requestId ${requestId})`,
      );
      await this.sleep(delay);
      if (callerSignal?.aborted) {
        throw classifyThrown(callerSignal.reason, label, requestId, callerSignal);
      }
    }
  }

  private send(
    method: string,
    path: string,
    body: unknown,
    requestId: string,
    signal: AbortSignal,
    accept = 'application/json',
  ): Promise<Response> {
    const headers: Record<string, string> = {
      accept,
      'x-internal-key': this.options.internalKey,
      'x-request-id': requestId,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    return this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }

  /** Exponential backoff with "equal jitter": half fixed, half random. */
  private backoff(attempt: number): number {
    const ceiling = this.baseDelayMs * 2 ** attempt;
    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
  }
}

function newRequestId(): string {
  return `api-${randomUUID()}`;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Math.min(Number(value) * 1000, MAX_RETRY_AFTER_MS);
}

function kindForStatus(status: number): AiErrorKind {
  if (status === 429 || status === 503 || status === 504) return 'unavailable';
  if (status === 502) return 'bad_output';
  if (status >= 400 && status < 500) return 'rejected';
  return 'internal';
}

async function errorFromResponse(
  response: Response,
  label: string,
  requestId: string,
): Promise<AiServiceError> {
  let message = `HTTP ${response.status}`;
  try {
    const body = errorResponseSchema.safeParse(await response.json());
    if (body.success) {
      message = Array.isArray(body.data.message) ? body.data.message.join('; ') : body.data.message;
    }
  } catch {
    // Not our error body (e.g. a proxy page): keep the status line.
  }
  return new AiServiceError(
    kindForStatus(response.status),
    message,
    label,
    requestId,
    response.status,
  );
}

function classifyThrown(
  thrown: unknown,
  label: string,
  requestId: string,
  callerSignal: AbortSignal | undefined,
): AiServiceError {
  if (thrown instanceof AiServiceError) return thrown;
  if (callerSignal?.aborted) {
    return new AiServiceError('aborted', 'request cancelled', label, requestId, undefined, {
      cause: thrown,
    });
  }
  if (thrown instanceof DOMException && thrown.name === 'TimeoutError') {
    return new AiServiceError('timeout', 'no response in time', label, requestId, undefined, {
      cause: thrown,
    });
  }
  // fetch() rejects with a TypeError for network failures (refused, reset, DNS).
  const reason =
    thrown instanceof Error
      ? thrown.cause instanceof Error
        ? thrown.cause.message
        : thrown.message
      : String(thrown);
  return new AiServiceError(
    'unavailable',
    `AI service unreachable: ${reason}`,
    label,
    requestId,
    undefined,
    { cause: thrown },
  );
}
