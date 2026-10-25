import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';

import { AggregatesService } from '../src/aggregates/aggregates.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

const SECRET = 'e2e-origin-secret';

describe('api (e2e)', () => {
  let app: NestExpressApplication;
  let aggregates: AggregatesService;

  beforeAll(async () => {
    process.env.ORIGIN_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
    aggregates = app.get(AggregatesService);

    const connection = app.get<Connection>(getConnectionToken());

    if (!connection.name.endsWith('_e2e')) {
      throw new Error(`refusing to drop database ${connection.name}: e2e needs a database named *_e2e`);
    }

    await connection.dropDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path).set('x-origin-secret', SECRET);

  it('reports mongo and redis up without the origin secret', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.info).toEqual({ mongo: { status: 'up' }, redis: { status: 'up' } });
  });

  it('rejects requests without the right origin secret', async () => {
    await request(app.getHttpServer()).get('/api/parkings').expect(401);
    await request(app.getHttpServer()).get('/api/parkings').set('x-origin-secret', '').expect(401);
    await request(app.getHttpServer()).get('/api/parkings').set('x-origin-secret', 'e2e-origin-secreX').expect(401);
    await request(app.getHttpServer()).get('/api/parkings').set('x-origin-secret', 'short').expect(401);
  });

  it('counts each parking reading once and serves hourly and daily aggregates', async () => {
    const readings = [
      { parkingId: 1, at: new Date('2026-10-25T09:05:00Z'), available: 6, capacity: 65 },
      { parkingId: 1, at: new Date('2026-10-25T09:35:00Z'), available: 10, capacity: 65 },
      { parkingId: 1, at: new Date('2026-10-25T10:05:00Z'), available: 2, capacity: 65 },
    ];

    expect(await aggregates.bulkParking(readings)).toBe(3);
    expect(await aggregates.bulkParking(readings)).toBe(0);
    expect(await aggregates.recordParking(readings[2])).toBe(false);
    expect(await aggregates.recordParking({ ...readings[2], at: new Date('2026-10-25T10:10:00Z'), available: 4 })).toBe(true);

    const hourly = await get('/api/parkings/1/hourly?from=2026-10-25T00:00:00Z&to=2026-10-26T00:00:00Z').expect(200);

    expect(hourly.headers['cache-control']).toBe('public, max-age=300');
    expect(hourly.body).toEqual([
      { hour: '2026-10-25T09:00:00.000Z', capacity: 65, available: { avg: 8, min: 6, max: 10, samples: 2 } },
      { hour: '2026-10-25T10:00:00.000Z', capacity: 65, available: { avg: 3, min: 2, max: 4, samples: 2 } },
    ]);

    const daily = await get('/api/parkings/1/daily?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z').expect(200);

    expect(daily.body).toEqual([
      { day: '2026-10-24T22:00:00.000Z', capacity: 65, available: { avg: 5.5, min: 2, max: 10, samples: 4 } },
    ]);

    const one = await get('/api/parkings/1').expect(200);

    expect(one.body).toMatchObject({ id: 1, name: 'MZD Parking - Dmowskiego', latest: { available: 4, capacity: 65 } });
    expect(one.body.url).toBeUndefined();
  });

  it('serves air aggregates per metric, bucketed by each measurement time', async () => {
    await aggregates.bulkAir([
      { deviceId: 1, metric: 'pm25', at: new Date('2026-09-01T10:00:00Z'), value: 10 },
      { deviceId: 1, metric: 'temperature', at: new Date('2026-09-01T10:00:00Z'), value: 15 },
      { deviceId: 1, metric: 'pm25', at: new Date('2026-09-01T10:30:00Z'), value: 20 },
    ]);
    expect(await aggregates.recordAir([{ deviceId: 1, metric: 'pm25', at: new Date('2026-09-01T10:30:00Z'), value: 20 }])).toBe(0);

    const hourly = await get('/api/air/1/hourly?from=2026-09-01T00:00:00Z&to=2026-09-02T00:00:00Z').expect(200);

    expect(hourly.body).toEqual([
      {
        hour: '2026-09-01T10:00:00.000Z',
        metrics: {
          pm25: { avg: 15, min: 10, max: 20, samples: 2 },
          temperature: { avg: 15, min: 15, max: 15, samples: 1 },
        },
      },
    ]);

    const daily = await get('/api/air/1/daily?from=2026-09-01T00:00:00Z&to=2026-09-02T00:00:00Z').expect(200);

    expect(daily.body[0].metrics.pm25).toEqual({ avg: 15, min: 10, max: 20, samples: 2 });

    const one = await get('/api/air/1').expect(200);

    expect(one.body.latest).toEqual({
      at: '2026-09-01T10:30:00.000Z',
      metrics: {
        pm25: { value: 20, at: '2026-09-01T10:30:00.000Z' },
        temperature: { value: 15, at: '2026-09-01T10:00:00.000Z' },
      },
    });
  });

  it('reports hourly coverage per source and city-wide daily air statistics', async () => {
    const coverage = await get('/api/stats/coverage?from=2026-10-24T22:00:00Z&to=2026-10-25T23:00:00Z').expect(200);

    expect(coverage.headers['cache-control']).toBe('public, max-age=3600');
    expect(coverage.body.parkings[0]).toEqual({ id: 1, name: 'MZD Parking - Dmowskiego', hours: 2, share: 8 });
    expect(coverage.body.parkings[1]).toMatchObject({ id: 2, hours: 0, share: 0 });
    expect(coverage.body.air).toEqual([]);

    const city = await get('/api/stats/air/daily?from=2026-09-01T00:00:00Z&to=2026-09-02T00:00:00Z').expect(200);

    expect(city.body).toEqual([
      {
        day: '2026-08-31T22:00:00.000Z',
        metrics: {
          pm25: { avg: 15, min: 10, max: 20, samples: 2, sensors: 1 },
          temperature: { avg: 15, min: 15, max: 15, samples: 1, sensors: 1 },
        },
      },
    ]);
  });

  it('counts a whole Warsaw day even when from falls mid-day', async () => {
    await aggregates.bulkParking([
      { parkingId: 4, at: new Date('2026-10-20T06:10:00Z'), available: 40, capacity: 145 },
      { parkingId: 4, at: new Date('2026-10-20T07:10:00Z'), available: 40, capacity: 145 },
      { parkingId: 4, at: new Date('2026-10-20T15:10:00Z'), available: 4, capacity: 145 },
    ]);

    const daily = await get('/api/parkings/4/daily?from=2026-10-20T10:30:00Z&to=2026-10-21T10:30:00Z').expect(200);

    expect(daily.body).toEqual([
      { day: '2026-10-19T22:00:00.000Z', capacity: 145, available: { avg: 28, min: 4, max: 40, samples: 3 } },
    ]);

    const hourly = await get('/api/parkings/4/hourly?from=2026-10-20T06:30:00Z&to=2026-10-20T07:00:00Z').expect(200);

    expect(hourly.body.map((r: { hour: string }) => r.hour)).toEqual(['2026-10-20T06:00:00.000Z']);
  });

  it('validates ids and ranges and never caches errors', async () => {
    const missing = await get('/api/parkings/999').expect(404);

    expect(missing.headers['cache-control']).toBeUndefined();
    await get('/api/parkings/1/hourly?from=2026-W01&to=2026-03-01T00:00:00Z').expect(400);
    await get('/api/parkings/abc').expect(400);
    await get('/api/parkings/1/hourly?from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z').expect(400);
    await get('/api/parkings/1/hourly?from=yesterday').expect(400);
  });

  it('throttles per CF-Connecting-IP', async () => {
    const hit = (ip: string) => request(app.getHttpServer()).get('/api/parkings').set('x-origin-secret', SECRET).set('cf-connecting-ip', ip);

    for (let i = 0; i < 120; i++) {
      await hit('203.0.113.7').expect(200);
    }

    await hit('203.0.113.7').expect(429);
    await hit('203.0.113.8').expect(200);
  });
});
