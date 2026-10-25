'use client';

import { Flex, Layout, Menu, Segmented, Switch, Typography, theme } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useI18n, type Locale } from '@/i18n';
import { useThemeMode } from '@/lib/theme';

const sectionOf = (pathname: string) => {
  if (pathname.startsWith('/parking')) return '/parkings';
  if (pathname.startsWith('/air')) return '/air';
  return '/';
};

export const Shell = ({ children }: { children: ReactNode }) => {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useThemeMode();
  const { token } = theme.useToken();
  const pathname = usePathname();

  const items = [
    { key: '/', label: <Link href="/">{t.nav.dashboard}</Link> },
    { key: '/parkings', label: <Link href="/parkings">{t.nav.parkings}</Link> },
    { key: '/air', label: <Link href="/air">{t.nav.air}</Link> },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Layout.Header style={{ height: 'auto', padding: '8px 16px', lineHeight: 'normal' }}>
        <Flex wrap align="center" gap={16} justify="space-between">
          <Flex wrap align="center" gap={16}>
            <Link href="/">
              <Typography.Text strong style={{ color: 'inherit', fontSize: 20 }}>
                {t.site.name}
              </Typography.Text>
            </Link>
            <Menu
              mode="horizontal"
              theme="dark"
              selectedKeys={[sectionOf(pathname)]}
              items={items}
              style={{ flex: 1, minWidth: 260, background: 'transparent' }}
            />
          </Flex>
          <Flex align="center" gap={12}>
            <Segmented<Locale>
              aria-label={t.controls.language}
              value={locale}
              options={[
                { label: 'PL', value: 'pl' },
                { label: 'EN', value: 'en' },
              ]}
              onChange={setLocale}
            />
            <Switch
              aria-label={t.controls.theme}
              checked={mode === 'dark'}
              checkedChildren={t.controls.dark}
              unCheckedChildren={t.controls.light}
              onChange={(checked) => setMode(checked ? 'dark' : 'light')}
            />
          </Flex>
        </Flex>
      </Layout.Header>
      <Layout.Content style={{ padding: 16, maxWidth: 1200, width: '100%', margin: '0 auto' }}>{children}</Layout.Content>
    </Layout>
  );
};
