import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AggregatesService } from '../aggregates/aggregates.service';
import { statView } from '../aggregates/hourly';
import { findParking, PARKINGS, ParkingSource } from '../catalog/catalog';
import { PublicCache } from '../common/cache';
import { DAILY_RANGE, HOURLY_RANGE, RangeQuery, resolveRange } from '../common/range';


@ApiTags('parking')
@Controller('parkings')
export class ParkingController {
  constructor(private readonly aggregates: AggregatesService) {}

  @Get()
  @PublicCache(300)
  async list() {
    return Promise.all(PARKINGS.map((p) => this.withLatest(p)));
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
    const rows = await this.aggregates.parkingHourly(id, from, to);

    return rows.map((r) => ({ hour: r._id.h, capacity: r.cap, available: statView(r) }));
  }

  @Get(':id/daily')
  @PublicCache(300)
  async daily(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    this.require(id);
    const { from, to } = resolveRange(query, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day');
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
