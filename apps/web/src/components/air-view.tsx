'use client';

import { Col, Empty, Flex, Row } from 'antd';

import { useI18n } from '@/i18n';
import { isCurrent, sortSensors } from '@/lib/air';
import { useAirSensors } from '@/lib/queries';
import { useNow } from '@/lib/use-now';

import { AirNotice } from './air-notice';
import { AirSensorCard } from './air-sensor-card';
import { PageTitle } from './page-title';
import { QueryState } from './query-state';

export const AirView = () => {
  const { t } = useI18n();
  const now = useNow();
  const air = useAirSensors();
  const sensors = sortSensors(air.rows, now);
  const anyCurrent = sensors.some((s) => isCurrent(s, now));

  return (
    <Flex vertical gap={16}>
      <PageTitle title={t.air.title} />
      <QueryState loading={air.loading} failed={air.failed} onRetry={air.refetch}>
        <Flex vertical gap={16}>
          {anyCurrent ? null : <AirNotice sensors={sensors} />}
          {sensors.length === 0 ? (
            <Empty description={t.air.empty} />
          ) : (
            <Row gutter={[16, 16]}>
              {sensors.map((sensor) => (
                <Col key={sensor.id} xs={24} sm={12} lg={8}>
                  <AirSensorCard sensor={sensor} now={now} />
                </Col>
              ))}
            </Row>
          )}
        </Flex>
      </QueryState>
    </Flex>
  );
};
