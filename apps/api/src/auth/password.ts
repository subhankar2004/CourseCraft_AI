import { type Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with Argon2id using the OWASP Password Storage Cheat Sheet's minimum
 * configuration (m = 19 MiB, t = 2, p = 1). The salt is random per hash and stored inside the
 * PHC-format string, so only that string is persisted (users.password_hash).
 * Shared by the seed script (#8) and the auth module (#9).
 */
const ARGON2ID = 2 as Algorithm; // ambient const enum; can't be referenced under isolatedModules

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Never throws on a malformed hash; returns false instead. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
