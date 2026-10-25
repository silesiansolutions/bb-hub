'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { readStore, subscribeStore, writeStore } from '@/lib/stores';

import { en } from './en';
import { pl } from './pl';
import type { Messages } from './pl';

export type Locale = 'pl' | 'en';

const STORAGE_KEY = 'bb-locale';
const catalogs: Record<Locale, Messages> = { pl, en };
const intlTags: Record<Locale, string> = { pl: 'pl-PL', en: 'en-GB' };

const getLocale = (): Locale => (readStore(STORAGE_KEY) === 'en' ? 'en' : 'pl');
const getServerLocale = (): Locale => 'pl';

export const useI18n = () => {
  const locale = useSyncExternalStore(subscribeStore, getLocale, getServerLocale);
  const setLocale = useCallback((next: Locale) => writeStore(STORAGE_KEY, next), []);

  return useMemo(() => ({ locale, setLocale, t: catalogs[locale], intlTag: intlTags[locale] }), [locale, setLocale]);
};
