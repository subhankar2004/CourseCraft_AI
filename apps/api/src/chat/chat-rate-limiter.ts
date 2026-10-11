import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { REDIS } from '../redis/redis.module.js';

/** Questions per user (each one runs an LLM): a short burst, and a budget per hour. */
export const CHAT_LIMITS = [
  { window: 'minute', seconds: 60, limit: 5 },
  { window: 'hour', seconds: 3600, limit: 60 },
] as const;
/** An answer still streaming blocks a second one; the lock expires if the API dies mid-answer. */
export const ACTIVE_LOCK_SECONDS = 180;

export type Acquired = { ok: true; release: () => Promise<void> };
export type Refused = { ok: false; retryAfterSec: number; reason: 'busy' | 'limit' };

// Deletes the lock only if it is still ours (it may have expired and been taken by a new answer).
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;

/**
 * Per-user limits for the course chatbot (#41), in Redis so they hold across API instances and
 * restarts (unlike the in-memory, per-IP throttler used for sign-in). Fixed windows per user,
 * plus one answer at a time.
 */
@Injectable()
export class ChatRateLimiter {
  private readonly prefix: string;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.prefix = `${config.get('QUEUE_PREFIX', { infer: true })}:chat`;
  }

  async acquire(userId: string, now = Date.now()): Promise<Acquired | Refused> {
    const lockKey = `${this.prefix}:active:${userId}`;
    const token = randomUUID();
    const locked = await this.redis.set(lockKey, token, 'EX', ACTIVE_LOCK_SECONDS, 'NX');
    if (locked === null) {
      const ttl = await this.redis.ttl(lockKey);
      return { ok: false, reason: 'busy', retryAfterSec: Math.max(ttl, 1) };
    }
    const release = async () => {
      await this.redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
    };
    for (const { window, seconds, limit } of CHAT_LIMITS) {
      const slot = Math.floor(now / 1000 / seconds);
      const key = `${this.prefix}:${window}:${userId}:${slot}`;
      const [[, count]] = (await this.redis
        .multi()
        .incr(key)
        .expire(key, seconds, 'NX')
        .exec()) as [[Error | null, number], [Error | null, number]];
      if (count > limit) {
        await release();
        const retryAfterSec = (slot + 1) * seconds - Math.floor(now / 1000);
        return { ok: false, reason: 'limit', retryAfterSec: Math.max(retryAfterSec, 1) };
      }
    }
    return { ok: true, release };
  }
}
