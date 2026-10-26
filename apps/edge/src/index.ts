import { proxyApi, type ProxyEnv } from './proxy.ts';

interface Env extends ProxyEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return proxyApi(request, env, caches.default, (task) => ctx.waitUntil(task));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
