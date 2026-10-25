import 'reflect-metadata';

import { ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

import { AggregatesService } from '../aggregates/aggregates.service';

import { StatsController } from './stats.controller';

describe('StatsController', () => {
  it('answers 503 with Retry-After while too many statistics wait', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const aggregates = {
      parkingHours: async () => {
        await gate;

        return 0;
      },
      airHours: async () => 0,
    } as unknown as AggregatesService;
    const controller = new StatsController(aggregates);
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
    const day = (n: number) => ({ from: `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`, to: `2026-02-${String(n).padStart(2, '0')}T00:00:00Z` });

    const pending = [1, 2, 3, 4].map((n) => controller.coverage(day(n), res));

    await expect(controller.coverage(day(5), res)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(headers['Retry-After']).toBe('30');
    release();
    await Promise.all(pending);
  });
});
