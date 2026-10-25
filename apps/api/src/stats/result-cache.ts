const TTL_MS = 3_600_000;
const MAX_ENTRIES = 200;

export class ResultCache<T> {
  private readonly entries = new Map<string, { at: number; value: Promise<T> }>();

  constructor(private readonly clock: () => number = Date.now) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.clock();
    const hit = this.entries.get(key);

    if (hit && now - hit.at < TTL_MS) {
      return hit.value;
    }

    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;

      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    const value = load();

    this.entries.set(key, { at: now, value });
    value.catch(() => this.entries.delete(key));

    return value;
  }
}
