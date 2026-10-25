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

  it('maps sensor names to metrics and takes the newest read_at', () => {
    expect(parseSyngeos(device)).toEqual({
      city: 'Bielsko-Biała',
      address: 'plac Adama Mickiewicza 3',
      at: new Date('2026-10-25T16:52:13Z'),
      metrics: { temperature: 6.1, pressure: 1007, pm25: 3.55 },
    });
  });

  it('tells a relocated device from a Bielsko-Biała one', () => {
    expect(isInCity(parseSyngeos(device)!, 'Bielsko-Biała')).toBe(true);
    expect(isInCity(parseSyngeos({ ...device, city: 'UM Puck' })!, 'Bielsko-Biała')).toBe(false);
  });
});
