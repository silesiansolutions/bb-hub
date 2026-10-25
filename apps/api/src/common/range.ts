import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export class RangeQuery {
  @ApiPropertyOptional({ description: 'ISO 8601 start, inclusive' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 end, exclusive' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export interface Range {
  from: Date;
  to: Date;
}

export const resolveRange = (query: RangeQuery, defaultSpan: number, maxSpan: number, now = new Date()): Range => {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - defaultSpan);

  if (from >= to) {
    throw new BadRequestException('from must be earlier than to');
  }

  if (to.getTime() - from.getTime() > maxSpan) {
    throw new BadRequestException(`range longer than ${Math.round(maxSpan / DAY)} days`);
  }

  return { from, to };
};

export const HOURLY_RANGE = { defaultSpan: DAY, maxSpan: 31 * DAY };
export const DAILY_RANGE = { defaultSpan: 30 * DAY, maxSpan: 400 * DAY };
