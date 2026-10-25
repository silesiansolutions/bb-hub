'use client';

import { Typography } from 'antd';
import { useEffect } from 'react';

import { useI18n } from '@/i18n';

export const useDocumentTitle = (title: string) => {
  const { t } = useI18n();

  useEffect(() => {
    const wanted = `${title} | ${t.site.name}`;
    const apply = () => {
      if (document.title !== wanted) {
        document.title = wanted;
      }
    };
    const observer = new MutationObserver(apply);

    apply();
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });

    return () => observer.disconnect();
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
