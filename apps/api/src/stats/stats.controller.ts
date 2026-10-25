import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AggregatesService } from '../aggregates/aggregates.service';
import { statView } from '../aggregates/hourly';
import { AIR_DEVICES, PARKINGS } from '../catalog/catalog';
import { PublicCache } from '../common/cache';
import { DAILY_RANGE, RangeQuery, resolveRange } from '../common/range';

import { mergeCityDays, share } from './merge';


@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly aggregates: AggregatesService) {}

  @Get('coverage')
  @PublicCache(3600)
  async coverage(@Query() query: RangeQuery) {
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');
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

  @Get('air/daily')
  @PublicCache(3600)
  async airDaily(@Query() query: RangeQuery) {
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');
    const perSensor = await Promise.all(AIR_DEVICES.map((a) => this.aggregates.airDaily(a.id, from, to)));

    return mergeCityDays(perSensor).map(({ day, metrics }) => ({
      day,
      metrics: Object.fromEntries(
        Object.entries(metrics).flatMap(([metric, stat]) => (stat ? [[metric, { ...statView(stat), sensors: stat.sensors }]] : [])),
      ),
    }));
  }
}
