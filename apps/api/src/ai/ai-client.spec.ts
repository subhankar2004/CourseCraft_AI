import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { AiServiceError } from './ai-client.errors.js';
import type { SseEvent } from '@coursecraft/shared';
import { aiDispatcher, AiClient, type AiClientOptions, fetchWith } from './ai-client.service.js';

const KEY = 'test-internal-key-that-is-at-least-32-characters';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}
type Handler = (req: Seen, res: ServerResponse) => void | Promise<void>;

/** A real HTTP server whose responses are scripted per request (in order). */
class ScriptedServer {
  readonly seen: Seen[] = [];
  private handlers: Handler[] = [];
  private server!: Server;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        const seen = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
        this.seen.push(seen);
        const handler = this.handlers.shift() ?? ((_, r) => json(r, 500, { error: 'unscripted' }));
        void handler(seen, res);
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  script(...handlers: Handler[]): void {
    this.handlers.push(...handlers);
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function aiError(status: number, message: string | string[]) {
  return {
    statusCode: status,
    error: 'Error',
    message,
    path: '/x',
    timestamp: '2026-10-11T10:00:00+00:00',
    requestId: 'r',
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DELETED = { courseId: 'c1', deleted: 3 };
const STRUCTURE = {
  title: 'SQL',
  description: 'd',
  level: 'Beginner',
  modules: [{ title: 'M', summary: 's', lessonRefs: ['l1'] }],
  repairs: [],
  fallback: false,
  promptId: 'course-structure@1',
  chatModel: 'llama3.1:8b',
  usage: { llmCalls: 1, inputTokens: 10, outputTokens: 5 },
};

describe('AiClient', () => {
  const server = new ScriptedServer();
  let sleeps: number[];

  beforeAll(() => {
    Logger.overrideLogger(false); // the client's retry/failure warnings are expected here
    return server.start();
  });
  afterAll(() => server.stop());
  beforeEach(() => {
    server.seen.length = 0;
    sleeps = [];
  });

  function client(options: Partial<AiClientOptions> = {}): AiClient {
    return new AiClient({
      baseUrl: `${server.url}/`,
      internalKey: KEY,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      ...options,
    });
  }

  async function failure(promise: Promise<unknown>): Promise<AiServiceError> {
    const error = await promise.then(
      () => {
        throw new Error('expected a failure');
      },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AiServiceError);
    return error as AiServiceError;
  }

  describe('slow replies (#95)', () => {
    // undici, behind Node's fetch, gives up after 300 s without response headers, or between
    // body chunks, by default. Reproduced here with a 300 ms limit (undici's timers are coarse:
    // it fires after ~1 s, hence replies 2 s late); the client's own dispatcher has no such
    // limit, so only the endpoint timeouts apply (30 min for a lesson).
    const slowHeaders: Handler = (_, res) => {
      setTimeout(() => json(res, 200, DELETED), 2000);
    };
    const slowBody: Handler = (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"courseId":"c1",');
      setTimeout(() => res.end('"deleted":3}'), 2000);
    };

    it.each([
      ['headers', slowHeaders, /Headers Timeout/],
      ['body', slowBody, /Body Timeout|terminated/],
    ] as const)(
      'a reply whose %s arrive late fails under a short undici limit',
      async (_, handler, message) => {
        const limited = aiDispatcher({ headersTimeout: 300, bodyTimeout: 300 });
        server.script(handler); // one attempt: the scripted queue stays in step
        const error = await failure(
          client({
            fetch: fetchWith(limited),
            limits: { vectors: { retries: 0 } },
          }).deleteCourseVectors('c1', { requestId: 'r' }),
        );
        expect(error.message).toMatch(message);
        await limited.close();
      },
    );

    it.each([
      ['headers', slowHeaders],
      ['body', slowBody],
    ] as const)(
      'the default client waits for late %s (its endpoint timeout decides)',
      async (_, handler) => {
        server.script(handler);
        const defaultClient = client({ fetch: undefined });
        expect(await defaultClient.deleteCourseVectors('c1')).toEqual(DELETED);
        await defaultClient.onApplicationShutdown();
      },
    );
  });

  it('sends the internal key, the request id and a JSON body; validates the reply', async () => {
    server.script((_, res) => json(res, 200, STRUCTURE));
    const body = { domain: 'Databases', lessons: [{ ref: 'l1', title: 'Intro' }] };
    const outline = await client().processStructure(body, { requestId: 'job-7.structure' });

    expect(outline.modules[0]?.lessonRefs).toEqual(['l1']);
    const [seen] = server.seen;
    expect(seen?.method).toBe('POST');
    expect(seen?.url).toBe('/process/structure');
    expect(seen?.headers['x-internal-key']).toBe(KEY);
    expect(seen?.headers['x-request-id']).toBe('job-7.structure');
    expect(seen?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen?.body ?? '')).toEqual(body);
  });

  it('generates a request id when none is given and encodes path ids', async () => {
    server.script((_, res) => json(res, 200, { ...DELETED, lessonId: 'l 1' }));
    await client().deleteLessonVectors('c1', 'l 1');
    expect(server.seen[0]?.headers['x-request-id']).toMatch(/^api-[0-9a-f-]{36}$/);
    expect(server.seen[0]?.url).toBe('/vectors/c1/lessons/l%201');
  });

  it('retries an outage, honouring Retry-After, then succeeds', async () => {
    server.script(
      (_, res) => json(res, 503, aiError(503, 'chat model unavailable'), { 'retry-after': '2' }),
      (_, res) => json(res, 200, DELETED),
    );
    expect(await client().deleteCourseVectors('c1', { requestId: 'r-1' })).toEqual(DELETED);
    expect(server.seen).toHaveLength(2);
    expect(server.seen.map((s) => s.headers['x-request-id'])).toEqual(['r-1', 'r-1']);
    expect(sleeps).toEqual([2000]);
  });

  it('backs off exponentially with jitter, then reports the outage as retryable', async () => {
    server.script(
      ...Array.from({ length: 3 }, (): Handler => (_, res) => json(res, 503, aiError(503, 'down'))),
    );
    const error = await failure(client({ baseDelayMs: 100 }).deleteCourseVectors('c1'));
    expect(server.seen).toHaveLength(3); // 1 + ENDPOINTS.vectors.retries
    expect(error.kind).toBe('unavailable');
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('down');
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(50);
    expect(sleeps[0]).toBeLessThanOrEqual(100);
    expect(sleeps[1]).toBeGreaterThanOrEqual(100);
    expect(sleeps[1]).toBeLessThanOrEqual(200);
  });

  it.each([
    [500, 'internal', 'boom'],
    [502, 'bad_output', 'notes failed after 3 attempts'],
    [404, 'rejected', 'no captions'],
    [422, 'rejected', 'body.youtubeId: bad; body.x: missing'],
  ] as const)('does not retry HTTP %i (%s)', async (status, kind, message) => {
    server.script((_, res) => json(res, status, aiError(status, message.split('; '))));
    const error = await failure(client().deleteCourseVectors('c1'));
    expect(server.seen).toHaveLength(1);
    expect([error.kind, error.status, error.message, error.retryable]).toEqual([
      kind,
      status,
      message,
      false,
    ]);
  });

  it('treats a network failure as an outage', async () => {
    const dead = new AiClient({
      baseUrl: 'http://127.0.0.1:9', // discard port: connection refused
      internalKey: KEY,
      sleep: () => Promise.resolve(),
      limits: { vectors: { retries: 1 } },
    });
    const error = await failure(dead.deleteCourseVectors('c1'));
    expect(error.kind).toBe('unavailable');
    expect(error.message).toMatch(/unreachable/);
  });

  it('times out slow responses; long calls are not retried on timeout', async () => {
    server.script(async (_, res) => {
      await sleep(300);
      json(res, 200, DELETED);
    });
    const fast = client({ limits: { processLesson: { timeoutMs: 50 } } });
    const body = {
      courseId: 'c1',
      lessonId: 'l1',
      youtubeId: 'Tk1t3WKK-ZY',
      videoTitle: 't',
      segments: [{ text: 'a', start: 0, duration: 1 }],
    };
    const error = await failure(fast.processLesson(body));
    expect(error.kind).toBe('timeout');
    expect(server.seen).toHaveLength(1); // retryTimeouts is false for processLesson
  });

  it('counts a slow body against the timeout too', async () => {
    server.script(async (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"courseId":"c1",');
      await sleep(300);
      res.end('"deleted":1}');
    });
    const error = await failure(
      client({ limits: { vectors: { timeoutMs: 80, retries: 0 } } }).deleteCourseVectors('c1'),
    );
    expect(error.kind).toBe('timeout');
  });

  it('rejects responses that break the contract, without retrying', async () => {
    server.script((_, res) => json(res, 200, { courseId: 'c1', deleted: 'three' }));
    const error = await failure(client().deleteCourseVectors('c1'));
    expect(error.kind).toBe('contract');
    expect(error.message).toMatch(/deleted/);
    expect(server.seen).toHaveLength(1);
  });

  it('stops when the caller cancels', async () => {
    server.script(async (_, res) => {
      await sleep(300);
      json(res, 200, DELETED);
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const error = await failure(client().deleteCourseVectors('c1', { signal: controller.signal }));
    expect(error.kind).toBe('aborted');
    expect(server.seen).toHaveLength(1);
  });

  describe('stream', () => {
    it('passes events through, even when the stream outlasts the connect timeout', async () => {
      server.script(async (_, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('event: token\ndata: Hel');
        await sleep(60);
        res.write('lo\n\n: keep-alive\n\nevent: token\r\ndata: world\r\n\r');
        await sleep(60);
        res.end('\nevent: done\ndata: {"citations":[]}\n\n');
      });
      const events: SseEvent[] = [];
      const streaming = client({ limits: { stream: { timeoutMs: 40 } } });
      for await (const event of streaming.stream('/rag/answer', { q: 'x' }, { requestId: 's-1' })) {
        events.push(event);
      }
      expect(events).toEqual([
        { event: 'token', data: 'Hello' },
        { event: 'token', data: 'world' },
        { event: 'done', data: '{"citations":[]}' },
      ]);
      expect(server.seen[0]?.headers.accept).toBe('text/event-stream');
      expect(server.seen[0]?.headers['x-request-id']).toBe('s-1');
    });

    it('rejects a non-stream response', async () => {
      server.script((_, res) => json(res, 200, { answer: 'x' }));
      const error = await failure(client().stream('/rag/answer', {}).next());
      expect(error.kind).toBe('contract');
    });

    it('ends when the caller cancels mid-stream', async () => {
      server.script(async (_, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: first\n\n');
        await sleep(500);
        res.end('data: never\n\n');
      });
      const controller = new AbortController();
      const events: string[] = [];
      const error = await failure(
        (async () => {
          for await (const event of client().stream(
            '/rag/answer',
            {},
            { signal: controller.signal },
          )) {
            events.push(event.data);
            controller.abort();
          }
        })(),
      );
      expect(events).toEqual(['first']);
      expect(error.kind).toBe('aborted');
    });
  });
});
