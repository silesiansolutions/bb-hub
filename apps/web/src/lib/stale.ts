const HOUR_MS = 3_600_000;

export const STALE_AFTER_MS = 3 * HOUR_MS;

export const isStale = (at: string | null | undefined, now: number): boolean =>
  !at || now - new Date(at).getTime() > STALE_AFTER_MS;
