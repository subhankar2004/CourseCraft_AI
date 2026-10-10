/**
 * Server-Sent Events parser (WHATWG HTML "event stream interpretation"), used to pass the AI
 * service's streamed answers through to the browser (#41).
 */
export interface SseEvent {
  /** The `event:` field; `message` when absent. */
  event: string;
  /** `data:` lines joined with "\n". */
  data: string;
  id?: string;
}

/** Turns a stream of text chunks (split anywhere, even mid-line) into events. */
export async function* parseSse(chunks: AsyncIterable<string>): AsyncGenerator<SseEvent> {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;

  function* dispatch(): Generator<SseEvent> {
    if (data.length > 0) {
      yield {
        event: event || 'message',
        data: data.join('\n'),
        ...(id === undefined ? {} : { id }),
      };
    }
    event = '';
    data = [];
  }

  function* line(text: string): Generator<SseEvent> {
    if (text === '') {
      yield* dispatch();
      return;
    }
    if (text.startsWith(':')) return; // comment (keep-alive)
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id' && !value.includes('\0')) id = value;
    // `retry` and unknown fields are ignored.
  }

  for await (const chunk of chunks) {
    buffer += chunk;
    // A trailing "\r" may be the first half of "\r\n": wait for the next chunk.
    let match: RegExpExecArray | null;
    const newline = /\r\n|\n|\r(?!$)/g;
    let start = 0;
    while ((match = newline.exec(buffer)) !== null) {
      yield* line(buffer.slice(start, match.index));
      start = match.index + match[0].length;
    }
    buffer = buffer.slice(start);
  }
  if (buffer.endsWith('\r')) yield* line(buffer.slice(0, -1));
  // An unterminated final event is discarded, as the spec requires.
}
