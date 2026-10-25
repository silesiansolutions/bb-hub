'use client';

import { Button, Result } from 'antd';
import Link from 'next/link';

import { useI18n } from '@/i18n';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <Result
      status="404"
      title={t.notFound.title}
      subTitle={t.notFound.text}
      extra={
        <Link href="/">
          <Button type="primary">{t.notFound.home}</Button>
        </Link>
      }
    />
  );
}
