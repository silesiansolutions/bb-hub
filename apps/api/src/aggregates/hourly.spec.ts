import { airUpsert, hourStart, parkingUpsert, statView } from './hourly';

describe('hourly aggregates', () => {
  it('truncates to the UTC hour', () => {
    expect(hourStart(new Date('2026-10-25T18:41:04.123Z')).toISOString()).toBe('2026-10-25T18:00:00.000Z');
  });

  it('builds a parking upsert keyed by parking and hour that skips readings already counted', () => {
    const at = new Date('2026-10-25T09:30:31.445Z');
    const { filter, update } = parkingUpsert({ parkingId: 1, at, available: 6, capacity: 65 });

    expect(filter).toEqual({
      _id: { p: 1, h: new Date('2026-10-25T09:00:00.000Z') },
      $or: [{ last: { $lt: at } }, { last: { $exists: false } }],
    });
    expect(Object.keys(filter._id)).toEqual(['p', 'h']);
    expect(update).toEqual({
      $inc: { n: 1, s: 6 },
      $min: { lo: 6 },
      $max: { hi: 6 },
      $set: { cap: 65, last: at },
    });
  });

  it('keys an air sample by the hour of its own measurement time, per metric', () => {
    const at = new Date('2025-06-30T20:00:00Z');
    const { filter, update } = airUpsert({ deviceId: 1, metric: 'pm10', at, value: 12 });

    expect(Object.keys(filter._id)).toEqual(['s', 'h']);
    expect(filter).toEqual({
      _id: { s: 1, h: new Date('2025-06-30T20:00:00Z') },
      $or: [{ 'm.pm10.t': { $lt: at } }, { 'm.pm10.t': { $exists: false } }],
    });
    expect(update).toEqual({
      $inc: { 'm.pm10.n': 1, 'm.pm10.s': 12 },
      $min: { 'm.pm10.lo': 12 },
      $max: { 'm.pm10.hi': 12 },
      $set: { 'm.pm10.t': at },
    });
  });

  it('turns counters into an average rounded to two places', () => {
    expect(statView({ n: 3, s: 10, lo: 2, hi: 5 })).toEqual({ avg: 3.33, min: 2, max: 5, samples: 3 });
  });
});
