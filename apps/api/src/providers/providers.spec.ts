import { parseControlla } from './controlla';
import { isInCity, parseSyngeos } from './syngeos';

describe('parseControlla', () => {
  it('reads free spots and capacity from the widget HTML', () => {
    const body = '\n<h4>Parking MZD Bielsko-Biała ul. Dmowskiego k/Ratusza</h4>\n<h2>Wolne miejsca: 0</h2>\n<h5>Pojemność parkingu: 65</h5>\n';

    expect(parseControlla(body)).toEqual({ available: 0, capacity: 65 });
  });

  it('rejects a body without both numbers', () => {
    expect(parseControlla('<h2>Wolne miejsca: 4</h2>')).toBeUndefined();
    expect(parseControlla({ html: 'x' })).toBeUndefined();
  });
});

describe('parseSyngeos', () => {
  const device = {
    city: 'Bielsko-Biała',
    address: 'plac Adama Mickiewicza 3',
    sensors: [
      { name: 'temperature', data: [{ read_at: '2026-10-25T17:52:13+01:00', value: 6.1 }] },
      { name: 'air_pressure', data: [{ read_at: '2026-10-25T17:52:13+01:00', value: '1007' }] },
      { name: 'pm2_5', data: [{ read_at: '2026-10-25T17:52:13+01:00', value: 3.55 }] },
      { name: 'unknown_gas', data: [{ read_at: '2026-10-25T17:52:13+01:00', value: 1 }] },
      { name: 'pm10', data: [] },
    ],
  };

  it('maps sensor names to metrics and keeps the read_at of each sensor', () => {
    const stale = { ...device, sensors: [...device.sensors, { name: 'pm1', data: [{ read_at: '2025-06-30T22:00:00+02:00', value: 4 }] }] };

    expect(parseSyngeos(stale)).toEqual({
      city: 'Bielsko-Biała',
      address: 'plac Adama Mickiewicza 3',
      values: [
        { metric: 'temperature', at: new Date('2026-10-25T16:52:13Z'), value: 6.1 },
        { metric: 'pressure', at: new Date('2026-10-25T16:52:13Z'), value: 1007 },
        { metric: 'pm25', at: new Date('2026-10-25T16:52:13Z'), value: 3.55 },
        { metric: 'pm1', at: new Date('2025-06-30T20:00:00Z'), value: 4 },
      ],
    });
  });

  it('tells a relocated device from a Bielsko-Biała one', () => {
    expect(isInCity(parseSyngeos(device)!, 'Bielsko-Biała')).toBe(true);
    expect(isInCity(parseSyngeos({ ...device, city: 'UM Puck' })!, 'Bielsko-Biała')).toBe(false);
  });

  it('matches the city spelled without Polish diacritics or in another case', () => {
    expect(isInCity(parseSyngeos({ ...device, city: 'Bielsko-Biala' })!, 'Bielsko-Biała')).toBe(true);
    expect(isInCity(parseSyngeos({ ...device, city: 'BIELSKO-BIAŁA ' })!, 'Bielsko-Biała')).toBe(true);
    expect(isInCity(parseSyngeos({ ...device, city: 'Bielsko-Biała' })!, 'Bielsko-Biala')).toBe(true);
  });
});
