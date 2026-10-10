import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(32),
  INTERNAL_API_KEY: 'y'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.MAX_VIDEOS_PER_COURSE).toBe(25);
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:3000']);
  });

  it('parses a comma-separated WEB_ORIGIN list', () => {
    const env = validateEnv({ ...valid, WEB_ORIGIN: 'http://a.test, https://b.test' });
    expect(env.WEB_ORIGIN).toEqual(['http://a.test', 'https://b.test']);
  });

  it('parses JWT_EXPIRES_IN into seconds', () => {
    expect(validateEnv(valid).JWT_EXPIRES_IN).toBe(604800);
    expect(validateEnv({ ...valid, JWT_EXPIRES_IN: '15m' }).JWT_EXPIRES_IN).toBe(900);
    expect(() => validateEnv({ ...valid, JWT_EXPIRES_IN: 'forever' })).toThrow(/JWT_EXPIRES_IN/);
  });

  it('parses TRUST_PROXY as boolean or hop count', () => {
    expect(validateEnv(valid).TRUST_PROXY).toBe(false);
    expect(validateEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'maybe' })).toThrow(/TRUST_PROXY/);
  });

  it('coerces API_PORT from a string', () => {
    expect(validateEnv({ ...valid, API_PORT: '5000' }).API_PORT).toBe(5000);
  });

  it('fails fast listing every missing required variable', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*JWT_SECRET[\s\S]*INTERNAL_API_KEY/,
    );
  });

  it('rejects the placeholder secret from .env.example', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'change-me' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
