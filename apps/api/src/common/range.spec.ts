import { BadRequestException } from '@nestjs/common';

import { DAILY_RANGE, HOURLY_RANGE, nextWarsawDay, resolveRange, startOfWarsawDay } from './range';

describe('range', () => {
  it('finds the Warsaw midnight in summer and winter time and across both DST changes', () => {
    expect(startOfWarsawDay(new Date('2026-07-10T15:00:00Z')).toISOString()).toBe('2026-07-09T22:00:00.000Z');
    expect(startOfWarsawDay(new Date('2026-01-10T23:30:00Z')).toISOString()).toBe('2026-01-10T23:00:00.000Z');
    expect(startOfWarsawDay(new Date('2026-10-25T20:00:00Z')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(startOfWarsawDay(new Date('2026-03-29T12:00:00Z')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(nextWarsawDay(new Date('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(nextWarsawDay(new Date('2026-10-24T22:00:00Z')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });

  it('rounds an hourly range out to whole hours', () => {
    expect(resolveRange({ from: '2026-10-25T08:30:00Z', to: '2026-10-25T10:10:00Z' }, HOURLY_RANGE.defaultSpan, HOURLY_RANGE.maxSpan, 'hour')).toEqual({
      from: new Date('2026-10-25T08:00:00Z'),
      to: new Date('2026-10-25T11:00:00Z'),
    });
  });

  it('rounds a daily range out to whole Warsaw days', () => {
    expect(resolveRange({ from: '2026-09-25T10:30:00Z', to: '2026-10-25T10:30:00Z' }, DAILY_RANGE.defaultSpan, DAILY_RANGE.maxSpan, 'day')).toEqual({
      from: new Date('2026-09-24T22:00:00Z'),
      to: new Date('2026-10-25T23:00:00Z'),
    });
  });

  it('rejects ISO 8601 forms that do not parse to a date', () => {
    expect(() => resolveRange({ from: '2026-W01', to: '2026-03-01T00:00:00Z' }, HOURLY_RANGE.defaultSpan, HOURLY_RANGE.maxSpan, 'hour')).toThrow(BadRequestException);
  });
});
