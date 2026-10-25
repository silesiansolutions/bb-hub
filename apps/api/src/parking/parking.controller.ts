import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AggregatesService } from '../aggregates/aggregates.service';
import { statView } from '../aggregates/hourly';
import { findParking, PARKINGS, ParkingSource } from '../catalog/catalog';
import { DAILY_RANGE, HOURLY_RANGE, RangeQuery, resolveRange } from '../common/range';

const CACHE = 'public, max-age=300';

@ApiTags('parking')
@Controller('parkings')
export class ParkingController {
  constructor(private readonly aggregates: AggregatesService) {}

  @Get()
  @Header('Cache-Control', CACHE)
  async list() {
    return Promise.all(PARKINGS.map((p) => this.withLatest(p)));
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
    const rows = await this.aggregates.parkingHourly(id, from, to);

    return rows.map((r) => ({ hour: r._id.h, capacity: r.cap, available: statView(r) }));
  }

  @Get(':id/daily')
  @Header('Cache-Control', CACHE)
  async daily(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    this.require(id);
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan);
    const rows = await this.aggregates.parkingDaily(id, from, to);

    return rows.map((r) => ({ day: r.day, capacity: r.value.cap, available: statView(r.value) }));
  }

  private require(id: number): ParkingSource {
    const parking = findParking(id);

    if (!parking) {
      throw new NotFoundException(`parking ${id} not found`);
    }

    return parking;
  }

  private async withLatest(parking: ParkingSource) {
    const latest = await this.aggregates.latestParking(parking.id);
    return {
      id: parking.id,
      provider: parking.provider,
      name: parking.name,
      street: parking.street,
      latest: latest ? { at: latest.at, available: latest.available, capacity: latest.capacity } : null,
    };
  }
}
