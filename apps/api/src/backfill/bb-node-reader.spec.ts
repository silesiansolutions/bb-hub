import { join } from 'node:path';

import { airSamples, listSources, parkingReadings } from './bb-node-reader';

const FIXTURES = join(__dirname, '__fixtures__');
const BACKUP = join(FIXTURES, 'backup');

describe('bb-node reader', () => {
  it('unions day files of the same source across trees, in date order', async () => {
    const sources = await listSources([FIXTURES, BACKUP, join(FIXTURES, 'missing')], 'climate');

    expect(sources.map((s) => s.id)).toEqual([1, 3]);
    expect(sources[0].days).toEqual([
      { day: '2025-09-20', files: [join(FIXTURES, 'climate/1/2025-09-20.json'), join(BACKUP, 'climate/1/2025-09-20.json')] },
    ]);
    expect(sources[1].days.map((d) => d.day)).toEqual(['2025-09-10', '2025-09-11']);
  });

  it('reads parking rows, coercing numeric strings and dropping bad dates', async () => {
    const readings = await parkingReadings(1, [join(FIXTURES, 'parking/1/2026-10-25.json')]);

    expect(readings).toEqual([
      { parkingId: 1, at: new Date('2026-10-25T09:05:00.000Z'), available: 6, capacity: 65 },
      { parkingId: 1, at: new Date('2026-10-25T09:35:00.000Z'), available: 8, capacity: 65 },
    ]);
  });

  it('merges both trees by date, drops the duplicate fetch and keeps stale sensors at their own time', async () => {
    const [source] = await listSources([FIXTURES, BACKUP], 'climate');
    const result = await airSamples(1, source.days[0].files, 'Bielsko-Biała');

    expect(result.samples).toEqual([
      { deviceId: 1, metric: 'no2', at: new Date('2025-09-20T08:00:00Z'), value: 18 },
      { deviceId: 1, metric: 'pm10', at: new Date('2025-06-30T20:00:00Z'), value: 9 },
      { deviceId: 1, metric: 'no2', at: new Date('2025-09-20T11:00:00Z'), value: 20 },
    ]);
    expect(result.lastInCity).toEqual(new Date('2025-09-20T12:00:00.000Z'));
  });

  it('counts fetches from another town and keeps every town without a city filter', async () => {
    const files = [join(FIXTURES, 'climate/3/2025-09-11.json')];

    expect(await airSamples(3, files, 'Bielsko-Biała')).toEqual({ samples: [], outsideCity: 1, lastInCity: undefined });
    expect((await airSamples(3, files, undefined)).samples).toHaveLength(1);
  });
});
