'use client';

import { Col, Flex, Row, Typography } from 'antd';
import Link from 'next/link';

import { useI18n } from '@/i18n';
import { isCurrent, sortSensors } from '@/lib/air';
import { useAirSensors, useParkings } from '@/lib/queries';
import { useNow } from '@/lib/use-now';

import { AirNotice } from './air-notice';
import { AirSensorCard } from './air-sensor-card';
import { PageTitle } from './page-title';
import { ParkingCard } from './parking-card';
import { QueryState } from './query-state';

export const DashboardView = () => {
  const { t } = useI18n();
  const now = useNow();
  const parkings = useParkings();
  const air = useAirSensors();
  const sensors = sortSensors(air.rows, now);
  const current = sensors.filter((s) => isCurrent(s, now));

  return (
    <Flex vertical gap={24}>
      <PageTitle title={t.dashboard.title} />
      <section>
        <Flex justify="space-between" align="baseline" wrap>
          <Typography.Title level={3}>{t.dashboard.parkingsHeading}</Typography.Title>
          <Link href="/parkings">{t.dashboard.allParkings}</Link>
        </Flex>
        <QueryState loading={parkings.loading} failed={parkings.failed} onRetry={parkings.refetch}>
          <Row gutter={[16, 16]}>
            {parkings.rows.map((parking) => (
              <Col key={parking.id} xs={24} sm={12} lg={6}>
                <ParkingCard parking={parking} now={now} />
              </Col>
            ))}
          </Row>
        </QueryState>
      </section>
      <section>
        <Flex justify="space-between" align="baseline" wrap>
          <Typography.Title level={3}>{t.dashboard.airHeading}</Typography.Title>
          <Link href="/air">{t.dashboard.allSensors}</Link>
        </Flex>
        <QueryState loading={air.loading} failed={air.failed} onRetry={air.refetch}>
          <Flex vertical gap={16}>
            {current.length === 0 ? (
              <AirNotice sensors={sensors} showArchiveLink />
            ) : (
              <>
                <Typography.Text type="secondary">{t.dashboard.currentSensors(current.length, sensors.length)}</Typography.Text>
                <Row gutter={[16, 16]}>
                  {current.slice(0, 4).map((sensor) => (
                    <Col key={sensor.id} xs={24} sm={12} lg={6}>
                      <AirSensorCard sensor={sensor} now={now} />
                    </Col>
                  ))}
                </Row>
              </>
            )}
          </Flex>
        </QueryState>
      </section>
    </Flex>
  );
};
