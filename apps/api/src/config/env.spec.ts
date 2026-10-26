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

  it('needs a buffer for the collector, and every export credential in production', () => {
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true' })).toThrow('COLLECTOR_ENABLED=true needs BUFFER_DIR');
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/var/lib/bb/buffer' })).not.toThrow();
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', ORIGIN_SECRET: 's', COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/b' })).toThrow(
      'COLLECTOR_ENABLED=true needs R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BB_DATA_REPO, BB_DATA_DIR, BB_DATA_GIT_NAME, BB_DATA_GIT_EMAIL, BB_DATA_SSH_KEY',
    );
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', ORIGIN_SECRET: 's', COLLECTOR_ENABLED: 'false' })).not.toThrow();
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/b', BB_DATA_SSH_KEY: '/nonexistent/deploy-key' })).toThrow('BB_DATA_SSH_KEY does not name a readable file');
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/b', BB_DATA_SSH_KEY: __filename })).not.toThrow();
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/b', BB_DATA_SSH_KEY: __dirname })).toThrow('BB_DATA_SSH_KEY does not name a readable file');
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/var/lib/bb/buffer', BB_DATA_DIR: '/var/lib/bb' })).toThrow('must not contain each other');
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/var/lib/bb', BB_DATA_DIR: '/var/lib/bb/bb-data' })).toThrow('must not contain each other');
    expect(() => validateEnv({ ...base, COLLECTOR_ENABLED: 'true', BUFFER_DIR: '/var/lib/bb/buffer', BB_DATA_DIR: '/var/lib/bb/bb-data' })).not.toThrow();
  });
});
