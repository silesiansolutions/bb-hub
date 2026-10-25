import 'reflect-metadata';

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
});
