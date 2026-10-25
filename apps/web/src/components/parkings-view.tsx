'use client';

import { Col, Empty, Flex, Row } from 'antd';

import { useI18n } from '@/i18n';
import { useParkings } from '@/lib/queries';
import { useNow } from '@/lib/use-now';

import { PageTitle } from './page-title';
import { ParkingCard } from './parking-card';
import { QueryState } from './query-state';

export const ParkingsView = () => {
  const { t } = useI18n();
  const now = useNow();
  const parkings = useParkings();

  return (
    <Flex vertical gap={16}>
      <PageTitle title={t.parkings.title} />
      <QueryState loading={parkings.loading} failed={parkings.failed} onRetry={parkings.refetch}>
        {parkings.rows.length === 0 ? (
          <Empty description={t.parkings.empty} />
        ) : (
          <Row gutter={[16, 16]}>
            {parkings.rows.map((parking) => (
              <Col key={parking.id} xs={24} sm={12} lg={8}>
                <ParkingCard parking={parking} now={now} />
              </Col>
            ))}
          </Row>
        )}
      </QueryState>
    </Flex>
  );
};
