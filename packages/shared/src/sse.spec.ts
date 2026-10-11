import { parseSse, type SseEvent } from './sse.js';

describe('parseSse', () => {
  async function* chunks(...parts: string[]): AsyncGenerator<string> {
    for (const part of parts) yield part;
  }
  async function all(...parts: string[]): Promise<SseEvent[]> {
    const events: SseEvent[] = [];
    for await (const event of parseSse(chunks(...parts))) events.push(event);
    return events;
  }

  it('joins multi-line data, keeps ids, ignores comments and unknown fields', async () => {
    expect(await all(': hi\nid: 7\nretry: 10\nfoo: bar\ndata: a\ndata:b\ndata\n\n')).toEqual([
      { event: 'message', data: 'a\nb\n', id: '7' },
    ]);
  });

  it('handles CRLF split across chunks and CR-only line endings', async () => {
    expect(await all('data: x\r', '\n\r', '\ndata: y\r\r')).toEqual([
      { event: 'message', data: 'x' },
      { event: 'message', data: 'y' },
    ]);
  });

  it('skips events without data and discards an unterminated last event', async () => {
    expect(await all('event: ping\n\ndata: kept\n\ndata: lost')).toEqual([
      { event: 'message', data: 'kept' },
    ]);
  });
});
