'use client';

import { Button, Flex, Result, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';

import { useI18n } from '@/i18n';

type Props = { loading: boolean; failed: boolean; onRetry: () => void; children: ReactNode };

export const QueryState = ({ loading, failed, onRetry, children }: Props) => {
  const { t } = useI18n();

  if (loading) {
    return (
      <Flex vertical align="center" gap={12} style={{ padding: 48 }} role="status">
        <Spin size="large" />
        <Typography.Text type="secondary">{t.status.loading}</Typography.Text>
      </Flex>
    );
  }

  if (failed) {
    return (
      <Result
        status="warning"
        title={t.status.error}
        extra={
          <Button type="primary" onClick={onRetry}>
            {t.status.retry}
          </Button>
        }
      />
    );
  }

  return children;
};
