'use client';

import { ClockCircleOutlined } from '@ant-design/icons';
import { Tag } from 'antd';

import { useI18n } from '@/i18n';

export const StaleTag = () => {
  const { t } = useI18n();

  return (
    <Tag color="default" icon={<ClockCircleOutlined />}>
      {t.stale.badge}
    </Tag>
  );
};
