'use client';

import { useMemo } from 'react';

import { useI18n } from '@/i18n';

import { TIME_ZONE } from './config';

const make = (tag: string) => {
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: TIME_ZONE });
  const hour = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const day = new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TIME_ZONE });
  const numbers = new Map<number, Intl.NumberFormat>();
  const percent = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 });

  const number = (value: number, digits = 1) => {
    let format = numbers.get(digits);
    if (!format) {
      format = new Intl.NumberFormat(tag, { minimumFractionDigits: 0, maximumFractionDigits: digits });
      numbers.set(digits, format);
    }

    return format.format(value);
  };

  return {
    number,
    percent: (ratio: number) => percent.format(ratio),
    dateTime: (iso: string) => dateTime.format(new Date(iso)),
    date: (iso: string) => date.format(new Date(iso)),
    hour: (iso: string) => hour.format(new Date(iso)),
    day: (iso: string) => day.format(new Date(iso)),
  };
};

export type Format = ReturnType<typeof make>;

export const useFormat = (): Format => {
  const { intlTag } = useI18n();

  return useMemo(() => make(intlTag), [intlTag]);
};
