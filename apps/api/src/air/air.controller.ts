import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AggregatesService } from '../aggregates/aggregates.service';
import { Stat, statView } from '../aggregates/hourly';
import { AIR_DEVICES, AirSource, findAirDevice } from '../catalog/catalog';
import { PublicCache } from '../common/cache';
import { DAILY_RANGE, HOURLY_RANGE, RangeQuery, resolveRange } from '../common/range';


const metricsView = (m: Partial<Record<string, Stat>>) =>
  Object.fromEntries(Object.entries(m).flatMap(([k, v]) => (v ? [[k, statView(v)]] : [])));

@ApiTags('air')
@Controller('air')
export class AirController {
  constructor(private readonly aggregates: AggregatesService) {}

  @Get()
  @PublicCache(300)
  async list() {
    return Promise.all(AIR_DEVICES.map((a) => this.withLatest(a)));
  }

  @Get(':id')
  @PublicCache(300)
  async one(@Param('id', ParseIntPipe) id: number) {
    return this.withLatest(this.require(id));
  }

  @Get(':id/hourly')
  @PublicCache(300)
  async hourly(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    this.require(id);
    const { from, to } = resolveRange(query, HOURLY_RANGE.defaultSpan, HOURLY_RANGE.maxSpan, 'hour');
    const rows = await this.aggregates.airHourly(id, from, to);

    return rows.map((r) => ({ hour: r._id.h, metrics: metricsView(r.m) }));
  }

  @Get(':id/daily')
  @PublicCache(300)
  async daily(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    this.require(id);
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');
    const rows = await this.aggregates.airDaily(id, from, to);

    return rows.map((r) => ({ day: r.day, metrics: metricsView(r.value) }));
  }

  private require(id: number): AirSource {
    const device = findAirDevice(id);

    if (!device) {
      throw new NotFoundException(`air device ${id} not found`);
    }

    return device;
  }

  private async withLatest(device: AirSource) {
    const latest = await this.aggregates.latestAir(device.id);

    const metrics = Object.entries(latest?.m ?? {}).flatMap(([metric, v]) => (v ? [{ metric, value: v.v, at: v.t }] : []));
    const at = metrics.reduce<Date | null>((max, m) => (!max || m.at > max ? m.at : max), null);

    return { ...device, latest: at ? { at, metrics: Object.fromEntries(metrics.map((m) => [m.metric, { value: m.value, at: m.at }])) } : null };
  }
}
