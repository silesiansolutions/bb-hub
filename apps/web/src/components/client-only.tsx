'use client';

import type { ReactNode } from 'react';

import { useMounted } from '@/lib/use-mounted';

export const ClientOnly = ({ children }: { children: ReactNode }) => {
  const mounted = useMounted();

  return mounted ? children : null;
};
