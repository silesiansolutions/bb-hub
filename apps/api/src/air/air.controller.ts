import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AggregatesService } from '../aggregates/aggregates.service';
import { Stat, statView } from '../aggregates/hourly';
import { AirSource, mergeAirDevices, parseAirId } from '../catalog/catalog';
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
    return Promise.all((await this.devices()).map((a) => this.withLatest(a)));
  }

  @Get(':id')
  @PublicCache(300)
  async one(@Param('id') id: string) {
    return this.withLatest(await this.require(id));
  }

  @Get(':id/hourly')
  @PublicCache(300)
  async hourly(@Param('id') raw: string, @Query() query: RangeQuery) {
    const { id } = await this.require(raw);
    const { from, to } = resolveRange(query, HOURLY_RANGE.defaultSpan, HOURLY_RANGE.maxSpan, 'hour');
    const rows = await this.aggregates.airHourly(id, from, to);

    return rows.map((r) => ({ hour: r._id.h, metrics: metricsView(r.m) }));
  }

  @Get(':id/daily')
  @PublicCache(300)
  async daily(@Param('id') raw: string, @Query() query: RangeQuery) {
    const { id } = await this.require(raw);
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');
    const rows = await this.aggregates.airDaily(id, from, to);

    return rows.map((r) => ({ day: r.day, metrics: metricsView(r.value) }));
  }

  private async devices(): Promise<AirSource[]> {
    return mergeAirDevices(await this.aggregates.discoveredAir());
  }

  private async require(raw: string): Promise<AirSource> {
    const id = parseAirId(raw);
    const device = id === undefined ? undefined : (await this.devices()).find((a) => a.id === id);

    if (!device) {
      throw new NotFoundException(`air device ${raw} not found`);
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
