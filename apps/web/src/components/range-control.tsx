'use client';

import { DatePicker, Flex, Select, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { useI18n } from '@/i18n';
import { DAY_MS, HOUR_MS, REFRESH_MS, TIME_ZONE } from '@/lib/config';
import { dayjs } from '@/lib/dayjs';
import type { Range } from '@/lib/queries';
import { useNow } from '@/lib/use-now';

export type Preset = { key: string; label: string; spanMs: number };

export type RangeState = { kind: 'preset'; key: string } | { kind: 'custom'; from: number; to: number };

export const presetSpan = (days: number) => days * DAY_MS;
export const HOUR_SPANS = { h24: 24 * HOUR_MS, d3: presetSpan(3), d7: presetSpan(7), d14: presetSpan(14), d31: presetSpan(31) };
export const DAY_SPANS = { d30: presetSpan(30), d90: presetSpan(90), d180: presetSpan(180), d365: presetSpan(365), d400: presetSpan(400) };

export const useRange = (presets: Preset[], initialKey: string, maxSpanMs: number, anchor?: string) => {
  const now = useNow(REFRESH_MS);
  const [state, setState] = useState<RangeState>({ kind: 'preset', key: initialKey });

  const range = useMemo<Range>(() => {
    if (state.kind === 'custom') {
      const to = Math.min(state.to, state.from + maxSpanMs);

      return { from: new Date(state.from).toISOString(), to: new Date(to).toISOString() };
    }

    const span = presets.find((p) => p.key === state.key)?.spanMs ?? maxSpanMs;
    const end = anchor ? Math.min(new Date(anchor).getTime(), now) : now;
    const to = Math.ceil(end / REFRESH_MS) * REFRESH_MS;

    return { from: new Date(to - span).toISOString(), to: new Date(to).toISOString() };
  }, [state, now, presets, maxSpanMs, anchor]);

  return { state, setState, range };
};

type Props = {
  presets: Preset[];
  state: RangeState;
  onChange: (state: RangeState) => void;
  range: Range;
  maxDays: number;
};

export const RangeControl = ({ presets, state, onChange, range, maxDays }: Props) => {
  const { t, locale } = useI18n();
  const value: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(range.from).tz(TIME_ZONE), dayjs(range.to).subtract(1, 'ms').tz(TIME_ZONE)];

  return (
    <Flex vertical gap={4}>
      <Flex wrap gap={8} align="center">
        <Select
          aria-label={t.range.label}
          style={{ minWidth: 200 }}
          value={state.kind === 'preset' ? state.key : undefined}
          options={presets.map((p) => ({ value: p.key, label: p.label }))}
          onChange={(key: string) => onChange({ kind: 'preset', key })}
        />
        <DatePicker.RangePicker
          key={locale}
          allowClear={false}
          value={value}
          format="YYYY-MM-DD"
          disabledDate={(current, info) => {
            if (current.isAfter(dayjs(), 'day')) return true;
            if (info.type !== 'date' || !info.from) return false;

            return Math.abs(current.diff(info.from, 'day')) >= maxDays;
          }}
          onChange={(dates) => {
            const start = dates?.[0];
            const end = dates?.[1];
            if (!start || !end) return;

            const from = dayjs.tz(start.format('YYYY-MM-DD'), TIME_ZONE).startOf('day');
            const to = dayjs.tz(end.format('YYYY-MM-DD'), TIME_ZONE).add(1, 'day').startOf('day');
            onChange({ kind: 'custom', from: from.valueOf(), to: to.valueOf() });
          }}
        />
      </Flex>
      <Typography.Text type="secondary">{t.range.maxHint(maxDays)}</Typography.Text>
    </Flex>
  );
};
