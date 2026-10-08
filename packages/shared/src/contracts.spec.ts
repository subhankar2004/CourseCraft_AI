import { aiHealthSchema, apiHealthSchema, errorResponseSchema } from './index.js';

// Fixtures are real responses captured from the running services (issues #3 and #5).
describe('errorResponseSchema', () => {
  it('accepts the NestJS API error body', () => {
    const body = {
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /api/v1/nope',
      path: '/api/v1/nope',
      timestamp: '2026-10-08T19:05:18.200Z',
      requestId: 'db7d9c3e-11be-4894-b623-64d9b93a6eb8',
    };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts the AI service error body (offset timestamp, message list)', () => {
    const body = {
      statusCode: 422,
      error: 'Unprocessable Content',
      message: ['body.count: Field required'],
      path: '/probe/echo',
      timestamp: '2026-10-08T19:37:54.377948+00:00',
      requestId: 'e4c208c3-9235-428a-a4c2-247b5d3e12e8',
    };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects a body missing required fields', () => {
    expect(errorResponseSchema.safeParse({ statusCode: 500 }).success).toBe(false);
  });
});

describe('health schemas', () => {
  it('accepts the API health response', () => {
    expect(apiHealthSchema.parse({ status: 'ok', info: {}, error: {}, details: {} }).status).toBe(
      'ok',
    );
  });

  it('accepts the AI service health response', () => {
    const body = {
      status: 'ok',
      service: 'coursecraft-ai',
      version: '0.1.0',
      providers: {
        llm: {
          provider: 'openai',
          chatModel: 'gpt-4o-mini',
          embeddingModel: 'text-embedding-3-small',
          configured: false,
        },
        vectorStore: { provider: 'pinecone', index: 'coursecraft-te3s', configured: false },
      },
    };
    expect(aiHealthSchema.parse(body)).toEqual(body);
  });
});
