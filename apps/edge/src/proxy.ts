export interface ProxyEnv {
  ORIGIN_URL: string;
  ORIGIN_SECRET: string;
}

export interface ProxyCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const FORWARDED = ['accept', 'accept-language', 'if-none-match'];

const failure = (status: number, message: string): Response =>
  new Response(JSON.stringify({ statusCode: status, message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const proxyApi = async (
  request: Request,
  env: ProxyEnv,
  cache: ProxyCache,
  waitUntil: (task: Promise<unknown>) => void,
  send: typeof fetch = fetch,
): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return failure(405, 'read-only API');
  }

  const url = new URL(request.url);
  const key = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(key);

  if (hit) {
    return hit;
  }

  const headers = new Headers({ 'x-origin-secret': env.ORIGIN_SECRET, 'x-client-ip': request.headers.get('cf-connecting-ip') ?? '' });

  for (const name of FORWARDED) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  let upstream: Response;

  try {
    upstream = await send(new URL(`${url.pathname}${url.search}`, env.ORIGIN_URL).toString(), { method: request.method, headers, redirect: 'manual' });
  } catch {
    return failure(502, 'API unreachable');
  }

  const response = new Response(upstream.body, upstream);

  if (request.method === 'GET' && response.status === 200 && /\bpublic\b/.test(response.headers.get('cache-control') ?? '')) {
    waitUntil(cache.put(key, response.clone()));
  }

  return response;
};
