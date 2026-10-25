'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { RefineThemes } from '@refinedev/antd';
import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/nextjs-router/app';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import enGB from 'antd/locale/en_GB';
import plPL from 'antd/locale/pl_PL';
import dayjs from 'dayjs';
import 'dayjs/locale/en-gb';
import 'dayjs/locale/pl';
import { Suspense, useEffect, type ReactNode } from 'react';

import { useI18n } from '@/i18n';
import { dataProvider } from '@/lib/data-provider';
import { useThemeMode } from '@/lib/theme';

const resources = [
  { name: 'parkings', list: '/parkings', show: '/parking' },
  { name: 'air', list: '/air', show: '/air-sensor' },
];

const Environment = ({ children }: { children: ReactNode }) => {
  const { locale } = useI18n();
  const { mode } = useThemeMode();
  const { token } = theme.useToken();

  useEffect(() => {
    document.documentElement.lang = locale;
    dayjs.locale(locale === 'pl' ? 'pl' : 'en-gb');
  }, [locale]);

  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
    document.body.style.background = token.colorBgLayout;
  }, [mode, token.colorBgLayout]);

  return children;
};

export const Providers = ({ children }: { children: ReactNode }) => {
  const { locale } = useI18n();
  const { mode } = useThemeMode();

  return (
    <AntdRegistry>
      <ConfigProvider
        locale={locale === 'pl' ? plPL : enGB}
        theme={{
          ...RefineThemes.Blue,
          algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        }}
      >
        <AntdApp>
          <Environment>
            <Suspense>
              <Refine
                dataProvider={dataProvider}
                routerProvider={routerProvider}
                resources={resources}
                options={{ syncWithLocation: false, disableTelemetry: true }}
              >
                {children}
              </Refine>
            </Suspense>
          </Environment>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
};
