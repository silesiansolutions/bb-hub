import { mergeCityDays, share } from './merge';

describe('city-wide air statistics', () => {
  const day1 = new Date('2025-09-20T22:00:00Z');
  const day2 = new Date('2025-09-21T22:00:00Z');

  it('merges per-sensor daily counters into one city day per metric', () => {
    const merged = mergeCityDays([
      [{ day: day1, value: { pm25: { n: 2, s: 20, lo: 8, hi: 12 } } }],
      [
        { day: day1, value: { pm25: { n: 1, s: 30, lo: 30, hi: 30 }, temperature: { n: 1, s: 5, lo: 5, hi: 5 } } },
        { day: day2, value: { pm25: { n: 1, s: 4, lo: 4, hi: 4 } } },
      ],
    ]);

    expect(merged).toEqual([
      {
        day: day1,
        metrics: {
          pm25: { n: 3, s: 50, lo: 8, hi: 30, sensors: 2 },
          temperature: { n: 1, s: 5, lo: 5, hi: 5, sensors: 1 },
        },
      },
      { day: day2, metrics: { pm25: { n: 1, s: 4, lo: 4, hi: 4, sensors: 1 } } },
    ]);
  });

  it('expresses covered hours as a percentage of the range', () => {
    expect(share(12, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'))).toBe(50);
    expect(share(0, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))).toBe(0);
  });

  it('does not count hours after now as missing data', () => {
    const now = new Date('2026-10-25T18:10:00Z');

    expect(share(20, new Date('2026-10-24T23:00:00Z'), new Date('2026-10-25T23:00:00Z'), now)).toBe(100);
    expect(share(19, new Date('2026-10-24T23:00:00Z'), new Date('2026-10-25T23:00:00Z'), new Date('2026-10-27T00:00:00Z'))).toBe(79.2);
  });
});
