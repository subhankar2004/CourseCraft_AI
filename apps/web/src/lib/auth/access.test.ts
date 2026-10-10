import { describe, expect, it } from 'vitest';
import { decideAccess, peekRole } from './access';
import { safeNextPath } from './redirect';

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (claims: object) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.signature`;

describe('decideAccess', () => {
  it('allows public pages with or without a session', () => {
    expect(decideAccess('/', undefined)).toBe('allow');
    expect(decideAccess('/login', undefined)).toBe('allow');
    expect(decideAccess('/dashboards-are-public', undefined)).toBe('allow'); // prefix ≠ segment
  });

  it('sends signed-out users to login for protected areas', () => {
    for (const path of ['/dashboard', '/learn/sql/abc', '/admin', '/admin/courses']) {
      expect(decideAccess(path, undefined)).toBe('login');
    }
  });

  it('allows students into their areas but not /admin', () => {
    const student = token({ sub: 'u1', role: 'STUDENT' });
    expect(decideAccess('/dashboard', student)).toBe('allow');
    expect(decideAccess('/learn/x/y', student)).toBe('allow');
    expect(decideAccess('/admin/domains', student)).toBe('forbidden');
  });

  it('allows admins into /admin', () => {
    expect(decideAccess('/admin', token({ sub: 'a1', role: 'ADMIN' }))).toBe('allow');
  });

  it('treats a malformed token as not-admin', () => {
    expect(peekRole('garbage')).toBeNull();
    expect(decideAccess('/admin', 'a.b.c')).toBe('forbidden');
  });
});

describe('safeNextPath', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(safeNextPath('/learn/sql/abc?t=90#notes')).toBe('/learn/sql/abc?t=90#notes');
  });

  it.each([
    null,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    '/\t/evil.com',
  ])('falls back for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/dashboard');
  });
});
