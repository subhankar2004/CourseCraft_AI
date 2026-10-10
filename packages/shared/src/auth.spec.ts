import { loginSchema, registerSchema, userSchema } from './index.js';

describe('registerSchema', () => {
  const valid = { email: '  Asha@Example.COM ', password: 'a-long-password', name: ' Asha ' };

  it('normalises email and name', () => {
    expect(registerSchema.parse(valid)).toEqual({
      email: 'asha@example.com',
      password: 'a-long-password',
      name: 'Asha',
    });
  });

  it('rejects short passwords and bad emails', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects unknown fields such as a self-assigned role', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts any non-empty password (no policy hints at login)', () => {
    expect(loginSchema.parse({ email: 'a@b.co', password: 'x' }).password).toBe('x');
  });
});

describe('userSchema', () => {
  it('accepts the public user view', () => {
    expect(
      userSchema.parse({
        id: 'u1',
        email: 'a@b.co',
        name: 'A',
        role: 'STUDENT',
        createdAt: '2026-10-10T05:00:00.000Z',
      }).role,
    ).toBe('STUDENT');
  });
});
