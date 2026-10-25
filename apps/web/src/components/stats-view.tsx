'use client';

import { Card, Flex, Progress, Table, Tabs, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';

import { useI18n } from '@/i18n';
import { DAILY_MAX_DAYS } from '@/lib/config';
import { useFormat } from '@/lib/format';
import { metricDigits } from '@/lib/metric-format';
import { METRICS, METRIC_UNITS, type MetricKey } from '@/lib/metrics';
import { useCityAirDaily, useCoverage } from '@/lib/queries';
import type { CoverageRow } from '@/lib/types';

import { PageTitle } from './page-title';
import { QueryState } from './query-state';
import { DAY_SPANS, RangeControl, presetSpan, useRange, type Preset } from './range-control';
import { SeriesChart } from './series-chart';

const DAILY_LIMIT = presetSpan(DAILY_MAX_DAYS);

type TableProps = { heading: string; rows: CoverageRow[]; href: string };

const CoverageTable = ({ heading, rows, href }: TableProps) => {
  const { t } = useI18n();
  const format = useFormat();

  return (
    <Flex vertical gap={8}>
      <Typography.Title level={4}>{heading}</Typography.Title>
      <Table<CoverageRow>
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: t.stats.source,
            dataIndex: 'name',
            render: (name: string, row) => <Link href={{ pathname: href, query: { id: row.id } }}>{name}</Link>,
          },
          { title: t.stats.hours, dataIndex: 'hours', align: 'right', render: (v: number) => format.number(v, 0) },
          {
            title: t.stats.share,
            dataIndex: 'share',
            width: 260,
            render: (v: number) => (
              <Flex align="center" gap={8}>
                <Progress percent={v} showInfo={false} size="small" style={{ flex: 1, margin: 0 }} aria-label={t.stats.share} />
                <Typography.Text>{format.number(v, 1)}%</Typography.Text>
              </Flex>
            ),
          },
        ]}
      />
    </Flex>
  );
};

export const StatsView = () => {
  const { t } = useI18n();
  const [selected, setSelected] = useState<MetricKey | null>(null);

  const presets: Preset[] = [
    { key: 'd30', label: t.range.presets.d30, spanMs: DAY_SPANS.d30 },
    { key: 'd90', label: t.range.presets.d90, spanMs: DAY_SPANS.d90 },
    { key: 'd365', label: t.range.presets.d365, spanMs: DAY_SPANS.d365 },
  ];
  const { state, setState, range } = useRange(presets, 'd30', DAILY_LIMIT);
  const coverage = useCoverage(range);
  const city = useCityAirDaily(range);

  const available = METRICS.filter((metric) => city.rows.some((row) => row.metrics[metric]));
  const active = selected && available.includes(selected) ? selected : (available[0] ?? null);

  return (
    <Flex vertical gap={16}>
      <PageTitle title={t.stats.title} />
      <RangeControl presets={presets} state={state} onChange={setState} range={range} maxDays={DAILY_MAX_DAYS} />
      <Card title={t.stats.coverageTitle}>
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">{t.stats.coverageHint}</Typography.Text>
          <QueryState loading={coverage.loading} failed={coverage.failed} onRetry={coverage.refetch}>
            {coverage.row ? (
              <>
                <CoverageTable heading={t.stats.parkingsHeading} rows={coverage.row.parkings} href="/parking" />
                <CoverageTable heading={t.stats.airHeading} rows={coverage.row.air} href="/air-sensor" />
              </>
            ) : null}
          </QueryState>
        </Flex>
      </Card>
      <Card title={t.stats.cityTitle}>
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">{t.stats.cityHint}</Typography.Text>
          <QueryState loading={city.loading} failed={city.failed} onRetry={city.refetch}>
            {active ? (
              <>
                <Tabs
                  activeKey={active}
                  onChange={(key) => setSelected(key as MetricKey)}
                  items={available.map((metric) => ({ key: metric, label: t.metrics[metric] }))}
                />
                <SeriesChart
                  title={`${t.stats.cityTitle}: ${t.metrics[active]}`}
                  granularity="day"
                  unit={METRIC_UNITS[active]}
                  digits={metricDigits(active)}
                  points={city.rows.flatMap((row) => {
                    const stat = row.metrics[active];

                    return stat ? [{ at: row.day, avg: stat.avg, min: stat.min, max: stat.max, sensors: stat.sensors }] : [];
                  })}
                />
              </>
            ) : (
              <Typography.Text type="secondary">{t.stats.noAir}</Typography.Text>
            )}
          </QueryState>
        </Flex>
      </Card>
    </Flex>
  );
};
