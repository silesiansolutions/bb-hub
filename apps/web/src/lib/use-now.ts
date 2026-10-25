'use client';

import { useEffect, useState } from 'react';

import { STALE_AFTER_MS } from './config';

export const useNow = (intervalMs = 60_000) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
};

export const isStale = (at: string | null | undefined, now: number): boolean =>
  !at || now - new Date(at).getTime() > STALE_AFTER_MS;
