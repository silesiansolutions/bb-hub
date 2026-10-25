'use client';

import { Button, Result } from 'antd';
import Link from 'next/link';

import { useI18n } from '@/i18n';

import { useDocumentTitle } from './page-title';

export const NotFoundView = () => {
  const { t } = useI18n();

  useDocumentTitle(t.meta.notFound.title);

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
};
