import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AggregatesService } from '../aggregates/aggregates.service';
import { statView } from '../aggregates/hourly';
import { AIR_DEVICES, PARKINGS } from '../catalog/catalog';
import { PublicCache } from '../common/cache';
import { DAILY_RANGE, RangeQuery, resolveRange } from '../common/range';

import { addSensorDays, CityDay, share, sortedCityDays } from './merge';
import { ResultCache } from './result-cache';


@ApiTags('stats')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('stats')
export class StatsController {
  private readonly cache = new ResultCache<unknown>();

  constructor(private readonly aggregates: AggregatesService) {}

  @Get('coverage')
  @PublicCache(3600)
  async coverage(@Query() query: RangeQuery) {
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');

    return this.cache.get(`coverage:${from.toISOString()}:${to.toISOString()}`, () => this.loadCoverage(from, to));
  }

  @Get('air/daily')
  @PublicCache(3600)
  async airDaily(@Query() query: RangeQuery) {
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');

    return this.cache.get(`air:${from.toISOString()}:${to.toISOString()}`, () => this.loadAirDaily(from, to));
  }

  private async loadCoverage(from: Date, to: Date) {
    const parkings = await Promise.all(
      PARKINGS.map(async (p) => {
        const hours = await this.aggregates.parkingHours(p.id, from, to);

        return { id: p.id, name: p.name, hours, share: share(hours, from, to) };
      }),
    );
    const air = await Promise.all(
      AIR_DEVICES.map(async (a) => {
        const hours = await this.aggregates.airHours(a.id, from, to);

        return { id: a.id, name: a.name, hours, share: share(hours, from, to) };
      }),
    );

    return { from, to, parkings, air: air.filter((a) => a.hours > 0) };
  }

  private async loadAirDaily(from: Date, to: Date) {
    const days = new Map<number, CityDay>();

    for (const device of AIR_DEVICES) {
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
