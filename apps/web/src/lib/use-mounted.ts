'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

export const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
