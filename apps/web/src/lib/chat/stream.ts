import {
  chatStreamEvents,
  parseSse,
  type ChatDoneEvent,
  type ChatRequest,
} from '@coursecraft/shared';
import { ApiError, apiUrl } from '@/lib/api';

export type ChatStreamHandlers = {
  /** The conversation the question was saved in (a new one when none was given). */
  onSession?: (sessionId: string) => void;
  onToken?: (text: string) => void;
};

export type ChatOutcome =
  | { kind: 'done'; done: ChatDoneEvent }
  | { kind: 'failed'; message: string }
  /** The stream ended early (connection lost); the question may be saved without an answer. */
  | { kind: 'interrupted' };

/**
 * `POST /courses/:id/chat` (#41): sends a question and reads the answer as Server-Sent Events.
 * `EventSource` can only GET, so the stream is read from `fetch`. Errors known before the
 * stream starts (403 not enrolled, 429 too many questions, 404, 400) throw an `ApiError`
 * carrying the API's message (and `Retry-After` seconds for 429).
 */
export async function askCourse(
  courseId: string,
  body: ChatRequest,
  handlers: ChatStreamHandlers = {},
  signal?: AbortSignal,
): Promise<ChatOutcome> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`courses/${courseId}/chat`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError({ statusCode: 0, error: 'Network Error', message: String(cause) });
  }
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('text/event-stream') || !response.body) {
    throw await chatError(response);
  }

  const chunks = readText(response.body.pipeThrough(new TextDecoderStream()));
  for await (const event of parseSse(chunks)) {
    const data: unknown = JSON.parse(event.data);
    switch (event.event) {
      case 'session':
        handlers.onSession?.(chatStreamEvents.session.parse(data).sessionId);
        break;
      case 'token':
        handlers.onToken?.(chatStreamEvents.token.parse(data).text);
        break;
      case 'done':
        return { kind: 'done', done: chatStreamEvents.done.parse(data) };
      case 'failed':
        return { kind: 'failed', message: chatStreamEvents.failed.parse(data).message };
      default:
        break; // `ping` keeps the connection open
    }
  }
  return { kind: 'interrupted' };
}

/** A stream's chunks via a reader: async iteration of ReadableStream isn't in Safari. */
async function* readText(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Seconds to wait after a 429, from `Retry-After`. */
export function retryAfterSeconds(error: unknown): number | null {
  return error instanceof ChatLimitError ? error.retryAfterSec : null;
}

export class ChatLimitError extends ApiError {
  constructor(
    body: ConstructorParameters<typeof ApiError>[0],
    readonly retryAfterSec: number,
  ) {
    super(body);
  }
}

async function chatError(response: Response): Promise<ApiError> {
  let body: { error?: string; message?: string | string[]; requestId?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // not JSON (a proxy error page): keep the status text
  }
  const error = {
    statusCode: response.status,
    error: body.error ?? response.statusText,
    message: body.message ?? response.statusText,
    requestId: body.requestId,
  };
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    return new ChatLimitError(error, Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
  }
  return new ApiError(error);
}
