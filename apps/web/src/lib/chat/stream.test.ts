import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { askCourse, ChatLimitError } from './stream';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiUrl: (path: string) => `http://api.test/${path}`,
}));

const message = {
  id: 'm2',
  role: 'ASSISTANT',
  content: 'Joins combine rows [1].',
  citations: [{ n: 1, lessonId: 'l1', lessonTitle: 'Joins', startSec: 0, endSec: 90, seekSec: 30 }],
  grounded: true,
  createdAt: '2026-10-11T10:00:00.000Z',
};

/** A fetch answering with an event stream split into awkward chunks. */
function streaming(...chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return vi.fn(
    async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('askCourse', () => {
  it('reads the session, tokens and the final message, across chunk boundaries', async () => {
    const fetch = streaming(
      'event: session\ndata: {"sessionId":"s1","userMessageId":"m1"}\n\nevent: tok',
      'en\ndata: {"text":"Joins "}\n\n: keep-alive\n\nevent: ping\ndata: {}\n\n',
      `event: token\ndata: {"text":"combine"}\n\nevent: done\ndata: ${JSON.stringify({ sessionId: 's1', message, refusal: null })}\n\n`,
    );
    vi.stubGlobal('fetch', fetch);
    const sessions: string[] = [];
    const tokens: string[] = [];
    const outcome = await askCourse(
      'c1',
      { message: 'What is a join?' },
      { onSession: (id) => sessions.push(id), onToken: (t) => tokens.push(t) },
    );
    expect(sessions).toEqual(['s1']);
    expect(tokens).toEqual(['Joins ', 'combine']);
    expect(outcome).toEqual({ kind: 'done', done: { sessionId: 's1', message, refusal: null } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/courses/c1/chat');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body as string)).toEqual({ message: 'What is a join?' });
  });

  it('reports a failure and an interrupted stream', async () => {
    vi.stubGlobal('fetch', streaming('event: failed\ndata: {"message":"Try again"}\n\n'));
    expect(await askCourse('c1', { message: 'q' })).toEqual({
      kind: 'failed',
      message: 'Try again',
    });
    vi.stubGlobal('fetch', streaming('event: token\ndata: {"text":"half"}\n\n'));
    expect(await askCourse('c1', { message: 'q' })).toEqual({ kind: 'interrupted' });
  });

  it('turns refusals before the stream into errors, with Retry-After for 429', async () => {
    const json = (status: number, body: object, headers: Record<string, string> = {}) =>
      vi.fn(async () => Response.json(body, { status, headers }));
    vi.stubGlobal(
      'fetch',
      json(
        429,
        { statusCode: 429, error: 'Too Many Requests', message: 'Too many questions' },
        {
          'Retry-After': '42',
        },
      ),
    );
    const limited = await askCourse('c1', { message: 'q' }).catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(ChatLimitError);
    expect((limited as ChatLimitError).retryAfterSec).toBe(42);

    vi.stubGlobal(
      'fetch',
      json(403, { statusCode: 403, error: 'Forbidden', message: 'Enroll first' }),
    );
    const forbidden = await askCourse('c1', { message: 'q' }).catch((e: unknown) => e);
    expect(forbidden).toBeInstanceOf(ApiError);
    expect((forbidden as ApiError).status).toBe(403);
    expect((forbidden as ApiError).message).toBe('Enroll first');
  });
});
