'use client';

import { Alert, Card, Col, Flex, Result, Row, Statistic, Typography } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useI18n } from '@/i18n';
import { DAILY_MAX_DAYS, HOURLY_MAX_DAYS } from '@/lib/config';
import { useFormat } from '@/lib/format';
import { useParking, useParkingDaily, useParkingHourly } from '@/lib/queries';
import { isStale, useNow } from '@/lib/use-now';

import { PageTitle } from './page-title';
import { QueryState } from './query-state';
import { DAY_SPANS, HOUR_SPANS, RangeControl, presetSpan, useRange, type Preset } from './range-control';
import { SeriesChart } from './series-chart';
import { StaleTag } from './stale-tag';

const HOURLY_LIMIT = presetSpan(HOURLY_MAX_DAYS);
const DAILY_LIMIT = presetSpan(DAILY_MAX_DAYS);

const parseId = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : NaN);

export const ParkingDetailView = () => {
  const { t } = useI18n();
  const format = useFormat();
  const now = useNow();
  const id = parseId(useSearchParams().get('id'));
  const parking = useParking(id);

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

  const hourlyRange = useRange(hourlyPresets, 'h24', HOURLY_LIMIT);
  const dailyRange = useRange(dailyPresets, 'd30', DAILY_LIMIT);
  const hourly = useParkingHourly(id, hourlyRange.range);
  const daily = useParkingDaily(id, dailyRange.range);

  if (!Number.isInteger(id) || parking.missing) {
    return (
      <Result
        status="404"
        title={t.parking.notFound}
        extra={<Link href="/parkings">{t.status.back}</Link>}
      />
    );
  }

  const latest = parking.row?.latest ?? null;
  const stale = isStale(latest?.at, now);
  const capacity = latest?.capacity ?? hourly.rows.at(-1)?.capacity;

  return (
    <Flex vertical gap={16}>
      <Link href="/parkings">{t.status.back}</Link>
      <PageTitle title={parking.row?.name ?? t.parkings.title} />
      <QueryState loading={parking.loading} failed={parking.failed} onRetry={parking.refetch}>
        {parking.row ? (
          <Flex vertical gap={16}>
            <Typography.Text type="secondary">{parking.row.street}</Typography.Text>
            {stale ? (
              <Alert type="warning" showIcon message={latest ? t.stale.outdatedSince(format.dateTime(latest.at)) : t.status.noData} />
            ) : null}
            <Card title={t.parking.current} extra={stale ? <StaleTag /> : null}>
              {latest ? (
                <Row gutter={[16, 16]} style={stale ? { opacity: 0.6 } : undefined}>
                  <Col xs={12} md={6}>
                    <Statistic title={t.parking.freeSpaces} value={format.number(latest.available, 0)} />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic title={t.parking.capacity} value={format.number(latest.capacity, 0)} />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic
                      title={t.parking.occupancy}
                      value={format.percent(latest.capacity > 0 ? (latest.capacity - latest.available) / latest.capacity : 0)}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic title={t.parking.updated} value={format.dateTime(latest.at)} valueStyle={{ fontSize: 16 }} />
                  </Col>
                </Row>
              ) : (
                <Typography.Text type="secondary">{t.status.noData}</Typography.Text>
              )}
            </Card>
            <Card title={t.parking.hourlyTitle}>
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
                    title={t.parking.hourlyTitle}
                    granularity="hour"
                    unit=""
                    digits={0}
                    zeroBased
                    reference={capacity ? { value: capacity, label: t.parking.capacity } : undefined}
                    points={hourly.rows.map((r) => ({ at: r.hour, avg: r.available.avg, min: r.available.min, max: r.available.max }))}
                  />
                </QueryState>
              </Flex>
            </Card>
            <Card title={t.parking.dailyTitle}>
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
                    title={t.parking.dailyTitle}
                    granularity="day"
                    unit=""
                    digits={0}
                    zeroBased
                    reference={capacity ? { value: capacity, label: t.parking.capacity } : undefined}
                    points={daily.rows.map((r) => ({ at: r.day, avg: r.available.avg, min: r.available.min, max: r.available.max }))}
                  />
                </QueryState>
              </Flex>
            </Card>
          </Flex>
        ) : null}
      </QueryState>
    </Flex>
  );
};
