import type { Metadata } from 'next';

import { pl } from '@/i18n/pl';

export const pageMetadata = (page: keyof typeof pl.meta): Metadata => ({
  title: `${pl.meta[page].title} | ${pl.site.name}`,
  description: pl.meta[page].description,
});
