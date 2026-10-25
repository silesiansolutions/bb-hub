'use client';

import { Empty, theme } from 'antd';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useI18n } from '@/i18n';
import { useFormat } from '@/lib/format';

export type SeriesPoint = { at: string; avg: number; min: number; max: number; sensors?: number };

type Props = {
  title: string;
  points: SeriesPoint[];
  unit: string;
  digits: number;
  granularity: 'hour' | 'day';
  reference?: { value: number; label: string };
  zeroBased?: boolean;
};

export const SeriesChart = ({ title, points, unit, digits, granularity, reference, zeroBased }: Props) => {
  const { t } = useI18n();
  const format = useFormat();
  const { token } = theme.useToken();

  if (points.length === 0) {
    return <Empty description={t.status.noDataInRange} />;
  }

  const data = points.map((p) => ({ ts: new Date(p.at).getTime(), iso: p.at, avg: p.avg, min: p.min, max: p.max, sensors: p.sensors }));
  const sensorsAt = (ts: number) => data.find((d) => d.ts === ts)?.sensors;
  const tick = (ts: number) => (granularity === 'hour' ? format.hour(new Date(ts).toISOString()) : format.day(new Date(ts).toISOString()));
  const label = (ts: number) => (granularity === 'hour' ? format.dateTime(new Date(ts).toISOString()) : format.date(new Date(ts).toISOString()));
  const value = (v: number) => (unit ? `${format.number(v, digits)} ${unit}` : format.number(v, digits));

  return (
    <div role="img" aria-label={title} style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={token.colorBorderSecondary} strokeDasharray="3 3" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={tick}
            stroke={token.colorTextSecondary}
            tickCount={4}
            minTickGap={48}
          />
          <YAxis
            stroke={token.colorTextSecondary}
            width={56}
            tickFormatter={(v: number) => format.number(v, digits)}
            domain={zeroBased ? [0, 'auto'] : ['auto', 'auto']}
          />
          <Tooltip
            labelFormatter={(ts) => {
              const count = sensorsAt(Number(ts));

              return count === undefined ? label(Number(ts)) : `${label(Number(ts))} | ${t.stats.sensorCount(count)}`;
            }}
            formatter={(v) => value(Number(v))}
            contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}` }}
          />
          <Legend />
          {reference ? <ReferenceLine y={reference.value} stroke={token.colorTextTertiary} strokeDasharray="4 4" label={reference.label} /> : null}
          <Line type="monotone" dataKey="max" name={t.parking.series.max} stroke={token.colorWarning} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="avg" name={t.parking.series.avg} stroke={token.colorPrimary} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="min" name={t.parking.series.min} stroke={token.colorSuccess} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
