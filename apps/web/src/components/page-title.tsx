'use client';

import { Typography } from 'antd';
import { useEffect } from 'react';

import { useI18n } from '@/i18n';

export const useDocumentTitle = (title: string) => {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${title} | ${t.site.name}`;
  }, [title, t.site.name]);
};

export const PageTitle = ({ title }: { title: string }) => {
  useDocumentTitle(title);

  return (
    <Typography.Title level={2} style={{ marginTop: 8 }}>
      {title}
    </Typography.Title>
  );
};
