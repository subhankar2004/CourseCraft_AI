/**
 * Why a call to the AI service failed. The job worker (#27) decides what to do from `kind`:
 * retry the job later (`retryable`), or record the video as failed.
 */
export type AiErrorKind =
  /** Network error, 503/504/429: the service or one of its models is down. Retry later. */
  | 'unavailable'
  /** No response in time. */
  | 'timeout'
  /** 502: the model's output stayed unusable after the AI service's own retries. */
  | 'bad_output'
  /** 4xx: the request can't succeed as is (e.g. 404 no transcript, 422 invalid input). */
  | 'rejected'
  /** 500: a bug in the AI service. Retrying won't help. */
  | 'internal'
  /** The response doesn't match the shared contract (packages/shared/src/ai.ts). */
  | 'contract'
  /** The caller cancelled the request. */
  | 'aborted';

export class AiServiceError extends Error {
  override readonly name = 'AiServiceError';

  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly endpoint: string,
    readonly requestId: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }

  /** Worth retrying later (the same request can succeed once the service recovers). */
  get retryable(): boolean {
    return this.kind === 'unavailable' || this.kind === 'timeout';
  }
}
