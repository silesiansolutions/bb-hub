import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateEnv } from './env';

const base = { MONGODB_URI: 'mongodb://db/bb', REDIS_URL: 'redis://cache:6379' };

describe('validateEnv', () => {
  it('refuses to start in production without an origin secret unless explicitly disabled', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow('ORIGIN_SECRET is required in production');
    expect(validateEnv({ ...base, NODE_ENV: 'production', ORIGIN_SECRET: 's3cret' }).ORIGIN_SECRET).toBe('s3cret');
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', ORIGIN_SECRET_DISABLED: 'true' })).not.toThrow();
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  it('allows CORS only outside production', () => {
    expect(() => validateEnv({ ...base, CORS_ORIGIN: 'http://localhost:3002' })).not.toThrow();
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', ORIGIN_SECRET: 's', CORS_ORIGIN: 'http://localhost:3002' })).toThrow('CORS_ORIGIN is for local development only');
  });

  it('accepts the example file as copied, with empty values meaning unset', () => {
    const example = Object.fromEntries(
      readFileSync(join(__dirname, '../../.env.example'), 'utf8')
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );

    expect(() => validateEnv(example)).not.toThrow();
    expect(() => validateEnv({ ...example, NODE_ENV: 'production', CORS_ORIGIN: '' })).toThrow('ORIGIN_SECRET is required in production');
    expect(() => validateEnv({ ...base, ORIGIN_SECRET_DISABLED: '1' })).toThrow();
  });
});
