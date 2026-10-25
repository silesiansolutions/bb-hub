'use client';

import { Alert } from 'antd';
import Link from 'next/link';

import { useI18n } from '@/i18n';
import { newestAt } from '@/lib/air';
import { useFormat } from '@/lib/format';
import type { AirSensor } from '@/lib/types';

export const AirNotice = ({ sensors, showArchiveLink }: { sensors: AirSensor[]; showArchiveLink?: boolean }) => {
  const { t } = useI18n();
  const format = useFormat();
  const newest = newestAt(sensors);

  return (
    <Alert
      type="warning"
      showIcon
      message={newest ? t.air.unavailable(format.dateTime(newest)) : t.air.unavailableNoData}
      action={showArchiveLink ? <Link href="/air">{t.dashboard.airArchive}</Link> : null}
    />
  );
};
