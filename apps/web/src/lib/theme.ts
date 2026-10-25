'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { readStore, subscribeStore, writeStore } from './stores';

export type Mode = 'light' | 'dark';

const STORAGE_KEY = 'bb-theme';
const QUERY = '(prefers-color-scheme: dark)';

const subscribeScheme = (callback: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', callback);

  return () => media.removeEventListener('change', callback);
};

const getSystemDark = () => window.matchMedia(QUERY).matches;

export const useThemeMode = () => {
  const stored = useSyncExternalStore(subscribeStore, () => readStore(STORAGE_KEY), () => null);
  const systemDark = useSyncExternalStore(subscribeScheme, getSystemDark, () => false);
  const mode: Mode = stored === 'dark' || stored === 'light' ? stored : systemDark ? 'dark' : 'light';
  const setMode = useCallback((next: Mode) => writeStore(STORAGE_KEY, next), []);

  return { mode, setMode };
};
