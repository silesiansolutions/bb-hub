import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import { pl } from '@/i18n/pl';

export const metadata: Metadata = {
  title: `${pl.site.name} | ${pl.site.tagline}`,
  description: pl.site.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body style={{ margin: 0 }}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
