import { join } from 'node:path';

import { airReadings, listSources, parkingReadings } from './bb-node-reader';

const FIXTURES = join(__dirname, '__fixtures__');

describe('bb-node reader', () => {
  it('lists source directories with day files in date order', async () => {
    const [source] = await listSources(join(FIXTURES, 'climate'));

    expect(source.id).toBe(3);
    expect(source.files.map((f) => f.slice(-15))).toEqual(['2025-09-10.json', '2025-09-11.json']);
  });

  it('reads parking rows, coercing numeric strings and dropping bad dates', async () => {
    const readings = await parkingReadings(1, join(FIXTURES, 'parking/1/2026-10-25.json'));

    expect(readings).toEqual([
      { parkingId: 1, at: new Date('2026-10-25T09:05:00.000Z'), available: 6, capacity: 65 },
      { parkingId: 1, at: new Date('2026-10-25T09:35:00.000Z'), available: 8, capacity: 65 },
    ]);
  });

  it('keeps air readings from the city and counts the relocated ones', async () => {
    const before = await airReadings(3, join(FIXTURES, 'climate/3/2025-09-10.json'), 'Bielsko-Biała');
    const after = await airReadings(3, join(FIXTURES, 'climate/3/2025-09-11.json'), 'Bielsko-Biała');

    expect(before).toEqual({
      readings: [{ deviceId: 3, at: new Date('2025-09-10T10:00:13Z'), metrics: { pm10: 12 } }],
      outsideCity: 0,
    });
    expect(after).toEqual({ readings: [], outsideCity: 1 });
  });

  it('keeps every town when no city is given', async () => {
    const all = await airReadings(3, join(FIXTURES, 'climate/3/2025-09-11.json'), undefined);

    expect(all.readings).toHaveLength(1);
  });
});
