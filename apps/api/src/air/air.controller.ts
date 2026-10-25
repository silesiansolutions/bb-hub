import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AggregatesService } from '../aggregates/aggregates.service';
import { AirHourly, statView } from '../aggregates/hourly';
import { AIR_DEVICES, AirSource, findAirDevice } from '../catalog/catalog';
import { DAILY_RANGE, HOURLY_RANGE, RangeQuery, resolveRange } from '../common/range';

const CACHE = 'public, max-age=300';

const metricsView = (m: AirHourly['m']) =>
  Object.fromEntries(Object.entries(m).flatMap(([k, v]) => (v ? [[k, statView(v)]] : [])));

@ApiTags('air')
@Controller('air')
export class AirController {
  constructor(private readonly aggregates: AggregatesService) {}

  @Get()
  @Header('Cache-Control', CACHE)
  async list() {
    return Promise.all(AIR_DEVICES.map((a) => this.withLatest(a)));
  }

  @Get(':id')
  @Header('Cache-Control', CACHE)
  async one(@Param('id', ParseIntPipe) id: number) {
    return this.withLatest(this.require(id));
  }

  @Get(':id/hourly')
  @Header('Cache-Control', CACHE)
  async hourly(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    this.require(id);
    const { from, to } = resolveRange(query, HOURLY_RANGE.defaultSpan, HOURLY_RANGE.maxSpan);
    const rows = await this.aggregates.airHourly(id, from, to);

    return rows.map((r) => ({ hour: r._id.h, metrics: metricsView(r.m) }));
  }

  @Get(':id/daily')
  @Header('Cache-Control', CACHE)
  async daily(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    this.require(id);
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan);
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

    return { ...device, latest: latest ? { at: latest.at, metrics: latest.metrics } : null };
  }
}
