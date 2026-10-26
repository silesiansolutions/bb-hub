import { Controller, Get, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AggregatesService } from '../aggregates/aggregates.service';
import { statView } from '../aggregates/hourly';
import { mergeAirDevices, PARKINGS } from '../catalog/catalog';
import { PublicCache } from '../common/cache';
import { DAILY_RANGE, RangeQuery, resolveRange } from '../common/range';

import { addSensorDays, CityDay, share, sortedCityDays } from './merge';
import { CacheBusyError, ResultCache } from './result-cache';


@ApiTags('stats')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('stats')
export class StatsController {
  private readonly cache = new ResultCache<unknown>();

  constructor(private readonly aggregates: AggregatesService) {}

  @Get('coverage')
  @PublicCache(3600)
  async coverage(@Query() query: RangeQuery, @Res({ passthrough: true }) res: Response) {
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');

    return this.cached(res, `coverage:${from.toISOString()}:${to.toISOString()}`, () => this.loadCoverage(from, to));
  }

  @Get('air/daily')
  @PublicCache(3600)
  async airDaily(@Query() query: RangeQuery, @Res({ passthrough: true }) res: Response) {
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');

    return this.cached(res, `air:${from.toISOString()}:${to.toISOString()}`, () => this.loadAirDaily(from, to));
  }

  private async cached(res: Response, key: string, load: () => Promise<unknown>) {
    try {
      return await this.cache.get(key, load);
    } catch (error) {
      if (error instanceof CacheBusyError) {
        res.setHeader('Retry-After', '30');
        throw new ServiceUnavailableException(error.message);
      }

      throw error;
    }
  }

  private async loadCoverage(from: Date, to: Date) {
    const parkings = await Promise.all(
      PARKINGS.map(async (p) => {
        const hours = await this.aggregates.parkingHours(p.id, from, to);

        return { id: p.id, name: p.name, hours, share: share(hours, from, to) };
      }),
    );
    const devices = mergeAirDevices(await this.aggregates.discoveredAir());
    const air = await Promise.all(
      devices.map(async (a) => {
        const hours = await this.aggregates.airHours(a.id, from, to);

        return { id: a.id, name: a.name, hours, share: share(hours, from, to) };
      }),
    );

    return { from, to, parkings, air: air.filter((a) => a.hours > 0) };
  }

  private async loadAirDaily(from: Date, to: Date) {
    const days = new Map<number, CityDay>();

    for (const device of mergeAirDevices(await this.aggregates.discoveredAir())) {
      addSensorDays(days, await this.aggregates.airDaily(device.id, from, to));
    }

    return sortedCityDays(days).map(({ day, metrics }) => ({
      day,
      metrics: Object.fromEntries(
        Object.entries(metrics).flatMap(([metric, stat]) => (stat ? [[metric, { ...statView(stat), sensors: stat.sensors }]] : [])),
      ),
    }));
  }
}
