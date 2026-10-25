'use client';

import { Card, Flex, Progress, Typography, theme } from 'antd';
import Link from 'next/link';

import { useI18n } from '@/i18n';
import { useFormat } from '@/lib/format';
import type { Parking } from '@/lib/types';
import { isStale } from '@/lib/use-now';

import { StaleTag } from './stale-tag';

const occupancyColor = (ratio: number) => (ratio >= 0.9 ? '#f5222d' : ratio >= 0.7 ? '#fa8c16' : '#52c41a');

export const ParkingCard = ({ parking, now }: { parking: Parking; now: number }) => {
  const { t } = useI18n();
  const format = useFormat();
  const { token } = theme.useToken();
  const { latest } = parking;
  const stale = isStale(latest?.at, now);
  const ratio = latest && latest.capacity > 0 ? (latest.capacity - latest.available) / latest.capacity : 0;

  return (
    <Card
      size="small"
      title={
        <Link href={{ pathname: '/parking', query: { id: parking.id } }}>{parking.name}</Link>
      }
      styles={{ title: { whiteSpace: 'normal' } }}
      style={{ height: '100%' }}
    >
      {stale ? (
        <Flex style={{ marginBottom: 8 }}>
          <StaleTag />
        </Flex>
      ) : null}
      <Flex vertical gap={8} style={stale ? { opacity: 0.65 } : undefined}>
        <Typography.Text type="secondary">{parking.street}</Typography.Text>
        {latest ? (
          <>
            <Flex align="baseline" gap={8}>
              <Typography.Text strong style={{ fontSize: 36, lineHeight: 1, color: stale ? token.colorTextSecondary : undefined }}>
                {format.number(latest.available, 0)}
              </Typography.Text>
              <Typography.Text type="secondary">
                {t.parkings.free} {t.parkings.outOf(format.number(latest.capacity, 0))}
              </Typography.Text>
            </Flex>
            <Progress
              percent={Math.round(ratio * 100)}
              showInfo={false}
              strokeColor={stale ? token.colorTextQuaternary : occupancyColor(ratio)}
              aria-label={t.parkings.occupancy(format.percent(ratio))}
            />
            <Typography.Text type="secondary">{t.parkings.occupancy(format.percent(ratio))}</Typography.Text>
            <Typography.Text type={stale ? 'danger' : 'secondary'}>
              {stale ? t.stale.outdatedSince(format.dateTime(latest.at)) : t.stale.lastReading(format.dateTime(latest.at))}
            </Typography.Text>
          </>
        ) : (
          <Typography.Text type="secondary">{t.status.noData}</Typography.Text>
        )}
      </Flex>
    </Card>
  );
};
