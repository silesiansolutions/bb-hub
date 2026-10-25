'use client';

import { Card, Flex, Tag, Typography } from 'antd';
import Link from 'next/link';

import { useI18n } from '@/i18n';
import { CAQI_COLORS, caqiLevel, type MetricKey } from '@/lib/metrics';
import { isCurrent, readingIsCurrent } from '@/lib/air';
import { useFormat } from '@/lib/format';
import { formatMetric } from '@/lib/metric-format';
import type { AirSensor } from '@/lib/types';

import { StaleTag } from './stale-tag';

const SUMMARY: MetricKey[] = ['pm25', 'pm10', 'temperature'];

export const AirSensorCard = ({ sensor, now }: { sensor: AirSensor; now: number }) => {
  const { t } = useI18n();
  const format = useFormat();
  const latest = sensor.latest;
  const current = isCurrent(sensor, now);
  const caqi = latest?.metrics.caqi;
  const caqiCurrent = readingIsCurrent(caqi, now);

  return (
    <Card
      size="small"
      title={<Link href={{ pathname: '/air-sensor', query: { id: sensor.id } }}>{sensor.name}</Link>}
      styles={{ title: { whiteSpace: 'normal' } }}
      style={{ height: '100%' }}
    >
      {latest ? (
        <Flex vertical gap={8}>
          {current ? null : (
            <Flex>
              <StaleTag />
            </Flex>
          )}
          <Flex vertical gap={8} style={current ? undefined : { opacity: 0.6 }}>
          {caqi ? (
            <Flex gap={8} align="center" style={caqiCurrent ? undefined : { opacity: 0.6 }}>
              <Tag color={caqiCurrent ? CAQI_COLORS[caqiLevel(caqi.value)] : 'default'}>{t.air.caqi[caqiLevel(caqi.value)]}</Tag>
              <Typography.Text type="secondary">
                {t.metrics.caqi}: {formatMetric('caqi', caqi.value, format)}
              </Typography.Text>
            </Flex>
          ) : null}
          <Flex wrap gap={16}>
            {SUMMARY.flatMap((metric) => {
              const reading = latest.metrics[metric];

              return reading
                ? [
                    <Flex key={metric} vertical style={readingIsCurrent(reading, now) ? undefined : { opacity: 0.6 }}>
                      <Typography.Text type="secondary">{t.metrics[metric]}</Typography.Text>
                      <Typography.Text strong>{formatMetric(metric, reading.value, format)}</Typography.Text>
                    </Flex>,
                  ]
                : [];
            })}
          </Flex>
          <Typography.Text type={current ? 'secondary' : 'danger'}>
            {current ? t.air.lastMeasurement(format.dateTime(latest.at)) : t.air.noCurrentReadings(format.dateTime(latest.at))}
          </Typography.Text>
          </Flex>
        </Flex>
      ) : null}
    </Card>
  );
};
