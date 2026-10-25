const TTL_MS = 3_600_000;
const MAX_ENTRIES = 24;
const MAX_WAITING = 4;

export class CacheBusyError extends Error {
  constructor() {
    super('statistics are busy, retry later');
  }
}

interface Entry<T> {
  at: number;
  value: Promise<T>;
}

export class ResultCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private queue: Promise<unknown> = Promise.resolve();
  private waiting = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.clock();
    const hit = this.entries.get(key);

    if (hit && now - hit.at < TTL_MS) {
      return hit.value;
    }

    if (this.waiting >= MAX_WAITING) {
      return Promise.reject(new CacheBusyError());
    }

    this.entries.delete(key);

    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;

      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.waiting++;

    const run = () => {
      this.waiting--;

      return load();
    };
    const value = this.queue.then(run, run);
    const entry = { at: now, value };

    this.queue = value.catch(() => undefined);
    this.entries.set(key, entry);
    value.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });

    return value;
  }
}
