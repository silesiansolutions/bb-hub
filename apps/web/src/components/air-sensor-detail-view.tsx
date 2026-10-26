'use client';

import { Alert, Card, Col, Flex, Result, Row, Tabs, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useI18n } from '@/i18n';
import { isCurrent, parseAirId } from '@/lib/air';
import { DAILY_MAX_DAYS, HOURLY_MAX_DAYS } from '@/lib/config';
import { useFormat } from '@/lib/format';
import { formatMetric, metricDigits } from '@/lib/metric-format';
import { CAQI_COLORS, METRICS, METRIC_UNITS, caqiLevel, type MetricKey } from '@/lib/metrics';
import { useAirDaily, useAirHourly, useAirSensor } from '@/lib/queries';
import type { Stat } from '@/lib/types';
import { isStale, useNow } from '@/lib/use-now';

import { PageTitle } from './page-title';
import { QueryState } from './query-state';
import { DAY_SPANS, HOUR_SPANS, RangeControl, presetSpan, useRange, type Preset } from './range-control';
import { SeriesChart, type SeriesPoint } from './series-chart';
import { StaleTag } from './stale-tag';

const HOURLY_LIMIT = presetSpan(HOURLY_MAX_DAYS);
const DAILY_LIMIT = presetSpan(DAILY_MAX_DAYS);

const toPoints = <T,>(rows: T[], at: (row: T) => string, stat: (row: T) => Stat | undefined): SeriesPoint[] =>
  rows.flatMap((row) => {
    const s = stat(row);

    return s ? [{ at: at(row), avg: s.avg, min: s.min, max: s.max }] : [];
  });

export const AirSensorDetailView = () => {
  const { t } = useI18n();
  const format = useFormat();
  const now = useNow();
  const id = parseAirId(useSearchParams().get('id'));
  const sensor = useAirSensor(id);
  const [selected, setSelected] = useState<MetricKey | null>(null);

  const hourlyPresets: Preset[] = [
    { key: 'h24', label: t.range.presets.h24, spanMs: HOUR_SPANS.h24 },
    { key: 'd3', label: t.range.presets.d3, spanMs: HOUR_SPANS.d3 },
    { key: 'd7', label: t.range.presets.d7, spanMs: HOUR_SPANS.d7 },
    { key: 'd14', label: t.range.presets.d14, spanMs: HOUR_SPANS.d14 },
    { key: 'd31', label: t.range.presets.d31, spanMs: HOUR_SPANS.d31 },
  ];
  const dailyPresets: Preset[] = [
    { key: 'd30', label: t.range.presets.d30, spanMs: DAY_SPANS.d30 },
    { key: 'd90', label: t.range.presets.d90, spanMs: DAY_SPANS.d90 },
    { key: 'd180', label: t.range.presets.d180, spanMs: DAY_SPANS.d180 },
    { key: 'd365', label: t.range.presets.d365, spanMs: DAY_SPANS.d365 },
    { key: 'd400', label: t.range.presets.d400, spanMs: DAY_SPANS.d400 },
  ];

  const latest = sensor.row?.latest ?? null;
  const current = sensor.row ? isCurrent(sensor.row, now) : false;
  const anchor = latest && !current ? latest.at : undefined;
  const hourlyRange = useRange(hourlyPresets, 'd7', HOURLY_LIMIT, anchor);
  const dailyRange = useRange(dailyPresets, 'd30', DAILY_LIMIT, anchor);
  const hourly = useAirHourly(id, hourlyRange.range);
  const daily = useAirDaily(id, dailyRange.range);

  if (id === undefined || sensor.missing) {
    return <Result status="404" title={t.air.notFound} extra={<Link href="/air">{t.status.back}</Link>} />;
  }

  const available = METRICS.filter((metric) => latest?.metrics[metric]);
  const active = selected && available.includes(selected) ? selected : (available[0] ?? null);
  const caqi = latest?.metrics.caqi;

  return (
    <Flex vertical gap={16}>
      <Link href="/air">{t.status.back}</Link>
      <PageTitle title={sensor.row?.name ?? t.air.title} />
      <QueryState loading={sensor.loading} failed={sensor.failed} onRetry={sensor.refetch}>
        {sensor.row ? (
          <Flex vertical gap={16}>
            {latest && !current ? (
              <Alert type="warning" showIcon message={t.air.noCurrentReadings(format.dateTime(latest.at))} />
            ) : null}
            {!latest ? <Alert type="warning" showIcon message={t.status.noData} /> : null}
            {latest ? (
              <Card
                title={t.air.latestHeading}
                extra={
                  caqi ? (
                    <Tag color={isStale(caqi.at, now) ? 'default' : CAQI_COLORS[caqiLevel(caqi.value)]}>
                      {t.air.quality}: {t.air.caqi[caqiLevel(caqi.value)]}
                    </Tag>
                  ) : null
                }
              >
                <Row gutter={[16, 16]}>
                  {available.map((metric) => {
                    const reading = latest.metrics[metric];
                    if (!reading) return null;
                    const stale = isStale(reading.at, now);

                    return (
                      <Col key={metric} xs={12} md={8} lg={6}>
                        <Flex vertical style={stale ? { opacity: 0.6 } : undefined}>
                          <Typography.Text type="secondary">{t.metrics[metric]}</Typography.Text>
                          <Typography.Text strong style={{ fontSize: 22 }}>
                            {formatMetric(metric, reading.value, format)}
                          </Typography.Text>
                          <Typography.Text type={stale ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                            {format.dateTime(reading.at)}
                          </Typography.Text>
                          {stale ? <StaleTag /> : null}
                        </Flex>
                      </Col>
                    );
                  })}
                </Row>
              </Card>
            ) : null}
            {active ? (
              <Tabs
                activeKey={active}
                onChange={(key) => setSelected(key as MetricKey)}
                items={available.map((metric) => ({ key: metric, label: t.metrics[metric] }))}
              />
            ) : null}
            {active ? (
              <>
                <Card title={`${t.air.hourlyTitle}: ${t.metrics[active]}`}>
                  <Flex vertical gap={16}>
                    <RangeControl
                      presets={hourlyPresets}
                      state={hourlyRange.state}
                      onChange={hourlyRange.setState}
                      range={hourlyRange.range}
                      maxDays={HOURLY_MAX_DAYS}
                    />
                    <QueryState loading={hourly.loading} failed={hourly.failed} onRetry={hourly.refetch}>
                      <SeriesChart
                        title={`${t.air.hourlyTitle}: ${t.metrics[active]}`}
                        granularity="hour"
                        unit={METRIC_UNITS[active]}
                        digits={metricDigits(active)}
                        points={toPoints(hourly.rows, (r) => r.hour, (r) => r.metrics[active])}
                      />
                    </QueryState>
                  </Flex>
                </Card>
                <Card title={`${t.air.dailyTitle}: ${t.metrics[active]}`}>
                  <Flex vertical gap={16}>
                    <RangeControl
                      presets={dailyPresets}
                      state={dailyRange.state}
                      onChange={dailyRange.setState}
                      range={dailyRange.range}
                      maxDays={DAILY_MAX_DAYS}
                    />
                    <QueryState loading={daily.loading} failed={daily.failed} onRetry={daily.refetch}>
                      <SeriesChart
                        title={`${t.air.dailyTitle}: ${t.metrics[active]}`}
                        granularity="day"
                        unit={METRIC_UNITS[active]}
                        digits={metricDigits(active)}
                        points={toPoints(daily.rows, (r) => r.day, (r) => r.metrics[active])}
                      />
                    </QueryState>
                  </Flex>
                </Card>
              </>
            ) : null}
          </Flex>
        ) : null}
      </QueryState>
    </Flex>
  );
};
