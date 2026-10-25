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

  it('builds per-metric counters and drops non-finite values', () => {
    const at = new Date('2026-10-25T01:00:13Z');
    const { filter, update } = airUpsert({ deviceId: 3, at, metrics: { pm25: 3.55, pm10: Number.NaN, temperature: -1.5 } });

    expect(Object.keys(filter._id)).toEqual(['s', 'h']);
    expect(update.$inc).toEqual({ n: 1, 'm.pm25.n': 1, 'm.pm25.s': 3.55, 'm.temperature.n': 1, 'm.temperature.s': -1.5 });
    expect(update.$min).toEqual({ 'm.pm25.lo': 3.55, 'm.temperature.lo': -1.5 });
    expect(update.$max).toEqual({ 'm.pm25.hi': 3.55, 'm.temperature.hi': -1.5 });
  });

  it('turns counters into an average rounded to two places', () => {
    expect(statView({ n: 3, s: 10, lo: 2, hi: 5 })).toEqual({ avg: 3.33, min: 2, max: 5, samples: 3 });
  });
});
