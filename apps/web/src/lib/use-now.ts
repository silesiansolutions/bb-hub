'use client';

import { useEffect, useState } from 'react';


export const useNow = (intervalMs = 60_000) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
};

export { isStale } from './stale.ts';
