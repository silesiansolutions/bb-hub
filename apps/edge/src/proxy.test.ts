import assert from 'node:assert/strict';
import { test } from 'node:test';

import { proxyApi, type ProxyCache } from './proxy.ts';

const env = { ORIGIN_URL: 'https://origin.example.invalid', ORIGIN_SECRET: 's3cret' };

const memoryCache = () => {
  const store = new Map<string, Response>();
  const cache: ProxyCache = {
    match: async (request) => store.get(request.url)?.clone(),
    put: async (request, response) => void store.set(request.url, response),
  };

  return { store, cache };
};

const run = async (request: Request, cache: ProxyCache, send: typeof fetch) => {
  const tasks: Promise<unknown>[] = [];
  const response = await proxyApi(request, env, cache, (task) => tasks.push(task), send);

  await Promise.all(tasks);

  return response;
};

test('forwards a read to the origin with the secret and the client address, never the caller headers', async () => {
  const seen: { url: string; headers: Headers }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: new Headers(init.headers) });

    return new Response('[]', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }) as typeof fetch;
  const request = new Request('https://bb.example/api/parkings/1/hourly?from=2026-10-01', {
    headers: { 'cf-connecting-ip': '203.0.113.9', 'x-origin-secret': 'forged', 'x-client-ip': '198.51.100.1', cookie: 'a=b', 'if-none-match': 'W/"1"', accept: 'application/json' },
  });

  const response = await run(request, memoryCache().cache, send);

  assert.equal(response.status, 200);
  assert.equal(seen[0]?.url, 'https://origin.example.invalid/api/parkings/1/hourly?from=2026-10-01');
  assert.equal(seen[0]?.headers.get('x-origin-secret'), 's3cret');
  assert.equal(seen[0]?.headers.get('x-client-ip'), '203.0.113.9');
  assert.equal(seen[0]?.headers.get('accept'), 'application/json');
  assert.equal(seen[0]?.headers.get('cookie'), null);
  assert.equal(seen[0]?.headers.get('if-none-match'), null);
});

test('serves public 200 responses from the edge cache, and never errors or private ones', async () => {
  let calls = 0;
  const { store, cache } = memoryCache();
  const send = (async (url: string) => {
    calls++;

    if (url.endsWith('/api/air')) return new Response('[1]', { headers: { 'cache-control': 'public, max-age=300' } });
    if (url.endsWith('/api/health')) return new Response('{}', { status: 200 });
    if (url.endsWith('/api/parkings')) return new Response('[]', { headers: { 'cache-control': 'public, max-age=0' } });

    return new Response('{}', { status: 503, headers: { 'cache-control': 'public, max-age=300' } });
  }) as typeof fetch;

  for (let i = 0; i < 2; i++) {
    assert.equal(await (await run(new Request('https://bb.example/api/air'), cache, send)).text(), '[1]');
    await run(new Request('https://bb.example/api/health'), cache, send);
    await run(new Request('https://bb.example/api/stats/coverage'), cache, send);
    await run(new Request('https://bb.example/api/parkings'), cache, send);
  }

  assert.deepEqual([...store.keys()], ['https://bb.example/api/air']);
  assert.equal(calls, 7);
});

test('refuses writes and answers 502 when the origin is down', async () => {
  const down = (async () => {
    throw new Error('connect ECONNREFUSED');
  }) as typeof fetch;

  const write = await run(new Request('https://bb.example/api/air', { method: 'POST' }), memoryCache().cache, down);

  assert.equal(write.status, 405);
  assert.equal(write.headers.get('allow'), 'GET, HEAD');

  const response = await run(new Request('https://bb.example/api/air'), memoryCache().cache, down);

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
