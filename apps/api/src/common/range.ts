import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TIMEZONE = 'Europe/Warsaw';

export class RangeQuery {
  @ApiPropertyOptional({ description: 'ISO 8601 start, inclusive, rounded down to the hour or the Warsaw day' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 end, exclusive, rounded up to the hour or the Warsaw day' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export interface Range {
  from: Date;
  to: Date;
}

const parse = (raw: string | undefined, fallback: () => Date, name: string): Date => {
  const date = raw ? new Date(raw) : fallback();

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${name} is not a date`);
  }

  return date;
};

const warsawOffset = (at: Date): number => {
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = zone?.match(/GMT([+-])(\d{2}):(\d{2})/);

  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * HOUR + Number(match[3]) * 60_000) : 0;
};

export const startOfWarsawDay = (at: Date): Date => {
  const local = new Date(at.getTime() + warsawOffset(at));
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());

  return new Date(midnight - warsawOffset(new Date(midnight - warsawOffset(at))));
};

export const nextWarsawDay = (at: Date): Date => {
  const start = startOfWarsawDay(at);

  return start.getTime() === at.getTime() ? start : startOfWarsawDay(new Date(start.getTime() + 26 * HOUR));
};

const floorHour = (at: Date): Date => new Date(Math.floor(at.getTime() / HOUR) * HOUR);
const ceilHour = (at: Date): Date => new Date(Math.ceil(at.getTime() / HOUR) * HOUR);

export type Granularity = 'hour' | 'day';

export const resolveRange = (
  query: RangeQuery,
  defaultSpan: number,
  maxSpan: number,
  granularity: Granularity,
  now = new Date(),
): Range => {
  const to = parse(query.to, () => now, 'to');
  const from = parse(query.from, () => new Date(to.getTime() - defaultSpan), 'from');

  if (from >= to) {
    throw new BadRequestException('from must be earlier than to');
  }

  if (to.getTime() - from.getTime() > maxSpan) {
    throw new BadRequestException(`range longer than ${Math.round(maxSpan / DAY)} days`);
  }

  return granularity === 'hour'
    ? { from: floorHour(from), to: ceilHour(to) }
    : { from: startOfWarsawDay(from), to: nextWarsawDay(to) };
};

export const HOURLY_RANGE = { defaultSpan: DAY, maxSpan: 31 * DAY };
export const DAILY_RANGE = { defaultSpan: 30 * DAY, maxSpan: 400 * DAY };
