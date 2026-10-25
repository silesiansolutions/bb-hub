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
    process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/bb_e2e';
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
    process.env.ORIGIN_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
    aggregates = app.get(AggregatesService);
    await app.get<Connection>(getConnectionToken()).dropDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path).set('x-origin-secret', SECRET);

  it('reports mongo and redis up without the origin secret', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.info).toEqual({ mongo: { status: 'up' }, redis: { status: 'up' } });
  });

  it('rejects requests without the origin secret', async () => {
    await request(app.getHttpServer()).get('/api/parkings').expect(401);
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

  it('serves air aggregates per metric', async () => {
    await aggregates.bulkAir([
      { deviceId: 1, at: new Date('2026-09-01T10:00:00Z'), metrics: { pm25: 10, temperature: 15 } },
      { deviceId: 1, at: new Date('2026-09-01T10:30:00Z'), metrics: { pm25: 20 } },
    ]);

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
  });

  it('validates ids and ranges', async () => {
    await get('/api/parkings/999').expect(404);
    await get('/api/parkings/abc').expect(400);
    await get('/api/parkings/1/hourly?from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z').expect(400);
    await get('/api/parkings/1/hourly?from=yesterday').expect(400);
  });
});
