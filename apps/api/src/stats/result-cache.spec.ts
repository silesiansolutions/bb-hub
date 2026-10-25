import { CacheBusyError, ResultCache } from './result-cache';

describe('ResultCache', () => {
  it('serves a result for an hour, then loads it again', async () => {
    let now = 0;
    let loads = 0;
    const cache = new ResultCache<number>(() => now);
    const load = async () => ++loads;

    expect(await cache.get('k', load)).toBe(1);
    now = 3_599_999;
    expect(await cache.get('k', load)).toBe(1);
    now = 3_600_000;
    expect(await cache.get('k', load)).toBe(2);
  });

  it('forgets failed loads and keeps at most 24 keys', async () => {
    const cache = new ResultCache<number>(() => 0);

    await expect(cache.get('bad', () => Promise.reject(new Error('mongo down')))).rejects.toThrow('mongo down');
    await new Promise((resolve) => setImmediate(resolve));
    expect(await cache.get('bad', async () => 7)).toBe(7);

    for (let i = 0; i < 30; i++) {
      await cache.get(`k${i}`, async () => i);
    }

    expect(await cache.get('k0', async () => -1)).toBe(-1);
    expect(await cache.get('k29', async () => -1)).toBe(29);
  });

  it('runs loads for different keys one at a time', async () => {
    const cache = new ResultCache<number>(() => 0);
    let running = 0;
    let peak = 0;
    const load = (n: number) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;

      return n;
    };

    expect(await Promise.all([cache.get('a', load(1)), cache.get('b', load(2)), cache.get('c', load(3))])).toEqual([1, 2, 3]);
    expect(peak).toBe(1);
  });

  it('refuses new uncached keys while four loads wait, but still serves cached ones', async () => {
    const cache = new ResultCache<number>(() => 0);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await cache.get('hot', async () => 0);

    const pending = [1, 2, 3, 4].map((n) => cache.get(`k${n}`, async () => {
      await gate;

      return n;
    }));

    await expect(cache.get('k5', async () => 5)).rejects.toBeInstanceOf(CacheBusyError);
    expect(await cache.get('hot', async () => -1)).toBe(0);
    release();
    expect(await Promise.all(pending)).toEqual([1, 2, 3, 4]);
    expect(await cache.get('k5', async () => 5)).toBe(5);
  });
});
