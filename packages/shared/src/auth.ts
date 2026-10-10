import { z } from 'zod';

/** Matches apps/api/src/auth/password.ts. Upper bound per OWASP guidance on long inputs. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

/** Public sign-up. There is deliberately no `role` field: every new account is a STUDENT. */
export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, 'Name is required').max(80),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  // Not re-validated against the length rules: login must not reveal password policy details.
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export const roleSchema = z.enum(['STUDENT', 'ADMIN']);

/** The safe, public view of a user (never includes the password hash). */
export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: roleSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
