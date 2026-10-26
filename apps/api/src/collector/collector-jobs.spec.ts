import 'reflect-metadata';

import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { git, seedOrigin } from '../../test/git';
import { AggregatesService } from '../aggregates/aggregates.service';
import { AirSample, ParkingReading } from '../aggregates/hourly';
import { AirSource } from '../catalog/catalog';

import { DayBuffer } from './buffer';
import { CollectorJobsService, exportableDays, Fetcher, SYNGEOS_DEVICES_URL, syngeosDeviceUrl } from './collector-jobs.service';
import { bootJobs, ensureSchedulers, SchedulerQueue } from './collector-scheduler.service';
import { CollectorStateService, Source } from './collector-state.service';

const controlla = (free: number, total: number) => `<div>Wolne miejsca: ${free}</div><div>Pojemność parkingu: ${total}</div>`;

const device = (city: string, readAt: string) =>
  JSON.stringify({ id: 10587, city, address: 'Wapienicka 1', sensors: [{ name: 'pm10', data: [{ read_at: readAt, value: 21 }] }, { name: 'pm2_5', data: [{ value: 9 }] }] });

class Fakes {
  parking: ParkingReading[] = [];
  air: AirSample[] = [];
  discovered: AirSource[][] = [];
  pollable: AirSource[] = [];
  successes: [Source, Record<string, unknown>][] = [];
  failures: Source[] = [];
  through?: string;

  aggregates = {
    recordParking: async (r: ParkingReading) => void this.parking.push(r),
    recordAir: async (s: AirSample[]) => void this.air.push(...s),
    saveDiscovery: async (found: AirSource[]) => void this.discovered.push(found),
    pollableAir: async () => this.pollable,
  } as unknown as AggregatesService;

  state = {
    success: async (source: Source, _at: Date, detail: Record<string, unknown>) => {
      this.successes.push([source, detail]);
      this.through = typeof detail.through === 'string' ? detail.through : this.through;
    },
    failure: async (source: Source) => void this.failures.push(source),
    exportedThrough: async () => this.through,
  } as unknown as CollectorStateService;
}

const service = (fakes: Fakes, settings: Record<string, string>, fetcher: Fetcher) => {
  const jobs = new CollectorJobsService({ get: (key: string) => settings[key] } as unknown as ConfigService, fakes.aggregates, fakes.state);

  jobs.fetcher = fetcher;

  return jobs;
};

describe('collector jobs', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bb-jobs-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('exports finished UTC days after 00:30, never the frozen ones or days already exported', () => {
    const days = ['2025-06-13', '2025-06-14', '2026-10-24', '2026-10-25', '2026-10-26'];

    expect(exportableDays(days, undefined, new Date('2026-10-26T00:20:00Z'))).toEqual(['2025-06-14', '2026-10-24']);
    expect(exportableDays(days, undefined, new Date('2026-10-26T00:45:00Z'))).toEqual(['2025-06-14', '2026-10-24', '2026-10-25']);
    expect(exportableDays(days, '2026-10-24', new Date('2026-10-26T00:45:00Z'))).toEqual(['2026-10-25']);
    expect(exportableDays(days, '2026-10-25', new Date('2026-10-26T23:59:00Z'))).toEqual([]);
  });

  it('catches up after a restart: polls and export at once, discovery only when stale', () => {
    const now = new Date('2026-10-26T12:00:00Z');

    expect(bootJobs(undefined, now)).toEqual(['discovery', 'parking', 'air', 'export']);
    expect(bootJobs(new Date('2026-10-26T00:10:00Z'), now)).toEqual(['parking', 'air', 'export']);
    expect(bootJobs(new Date('2026-10-25T00:10:00Z'), now)).toEqual(['discovery', 'parking', 'air', 'export']);
  });

  it('registers the schedulers again on every resync, the export on its own queue', async () => {
    const calls: string[] = [];
    const queue = (name: string) => ({ upsertJobScheduler: async (id: string, repeat: { pattern: string }) => void calls.push(`${name}:${id}:${repeat.pattern}`) }) as unknown as SchedulerQueue;
    const queues = { collector: queue('collector'), 'collector-export': queue('collector-export') };

    await ensureSchedulers(queues);
    await ensureSchedulers(queues);

    expect(calls.slice(0, 4)).toEqual(['collector:parking:*/5 * * * *', 'collector:air:*/5 * * * *', 'collector:discovery:10 0 * * *', 'collector-export:export:45 0 * * *']);
    expect(calls.slice(4)).toEqual(calls.slice(0, 4));
  });

  it('keeps the exported day through an empty run on the real state service', async () => {
    const docs = new Map<string, Record<string, unknown>>([['export', { _id: 'export', lastSuccess: new Date(), detail: { through: '2026-10-24' } }]]);
    const collection = {
      findOne: async ({ _id }: { _id: string }) => docs.get(_id) ?? null,
      updateOne: async ({ _id }: { _id: string }, { $set }: { $set: Record<string, unknown> }) => void docs.set(_id, { ...docs.get(_id), _id, ...$set }),
    };
    const state = new CollectorStateService({ collection: () => collection } as never);
    const fakes = new Fakes();
    const jobs = new CollectorJobsService({ get: (key: string) => ({ BUFFER_DIR: join(root, 'buffer') })[key] } as unknown as ConfigService, fakes.aggregates, state);

    await jobs.run('export', new Date('2026-10-25T23:00:00Z'));
    expect(await state.exportedThrough()).toBe('2026-10-24');
  });

  it('reads the exported day only when it is a day', async () => {
    let stored: unknown;
    const state = new CollectorStateService({ collection: () => ({ findOne: async () => stored }) } as never);

    stored = { _id: 'export', detail: { through: 'none' } };
    expect(await state.exportedThrough()).toBeUndefined();
    stored = null;
    expect(await state.exportedThrough()).toBeUndefined();
    stored = { _id: 'export', detail: { through: '2026-10-25' } };
    expect(await state.exportedThrough()).toBe('2026-10-25');
  });

  it('keeps a reading in the buffer even when Mongo fails, and rejects non-object air responses', async () => {
    const fakes = new Fakes();

    fakes.aggregates.recordParking = async () => Promise.reject(new Error('mongo down'));
    fakes.pollable = [{ id: 'd10587', provider: 'syngeos', device: 10587, name: 'Wapienicka 1' }];

    const jobs = service(fakes, { BUFFER_DIR: join(root, 'buffer') }, async (url) => (url.includes('syngeos') ? 'null' : controlla(5, 65)));

    await jobs.run('parking');
    await expect(jobs.run('air')).rejects.toThrow('all 1 fetches failed');

    const buffer = new DayBuffer(join(root, 'buffer'));
    const entries = await buffer.read((await buffer.days())[0]);

    expect(entries.map((e) => `${e.type}/${e.id}:${e.lines.length}`)).toEqual(['parking/1:1', 'parking/2:1', 'parking/3:1', 'parking/4:1']);
  });

  it('discovers city devices, keeps legacy ordinals, and buffers the list once a day', async () => {
    const fakes = new Fakes();
    const list = JSON.stringify([
      { id: 1329, city: 'Bielsko-Biała', address: 'Bohaterów Warszawy 20' },
      { id: 10587, city: 'Bielsko-Biala', address: ' Wapienicka 1 ' },
      { id: 10588, city: 'BIELSKO-BIAŁA' },
      { id: 1384, city: 'Węgrów', address: 'Cieszyńska 393' },
      { id: 'x', city: 'Bielsko-Biała' },
    ]);
    const jobs = service(fakes, { BUFFER_DIR: join(root, 'buffer') }, async (url) => (url === SYNGEOS_DEVICES_URL ? list : Promise.reject(new Error(url))));

    await jobs.run('discovery', new Date('2026-10-26T00:10:00Z'));
    await jobs.run('discovery', new Date('2026-10-26T09:00:00Z'));

    expect(fakes.discovered[0]).toEqual([
      { id: 3, provider: 'syngeos', device: 1329, name: 'Bohaterów Warszawy 20' },
      { id: 'd10587', provider: 'syngeos', device: 10587, name: 'Wapienicka 1' },
      { id: 'd10588', provider: 'syngeos', device: 10588, name: 'Syngeos 10588' },
    ]);
    expect(fakes.successes[0]).toEqual(['discovery', { listed: 5, found: 3 }]);

    const [source] = await new DayBuffer(join(root, 'buffer')).read('2026-10-26');

    expect(source.type).toBe('source');
    expect(source.lines).toEqual([{ date: '2026-10-26T00:10:00.000Z', raw: list }]);
  });

  it('buffers every air response, but aggregates only while the device reports the city', async () => {
    const fakes = new Fakes();
    const readAt = new Date(Date.now() - 60_000).toISOString();

    fakes.pollable = [
      { id: 'd10587', provider: 'syngeos', device: 10587, name: 'Wapienicka 1' },
      { id: 'd10589', provider: 'syngeos', device: 10589, name: 'Gone' },
      { id: 3, provider: 'syngeos', device: 1329, name: 'Bohaterów Warszawy 20' },
    ];

    const jobs = service(fakes, { BUFFER_DIR: join(root, 'buffer') }, async (url) => {
      if (url === syngeosDeviceUrl(10587)) return device('Bielsko-Biała', readAt);
      if (url === syngeosDeviceUrl(1329)) return device('Puck', readAt);
      throw new Error('503');
    });

    await jobs.run('air');

    expect(fakes.air).toEqual([{ deviceId: 'd10587', metric: 'pm10', at: new Date(readAt), value: 21 }]);
    expect(fakes.successes[0]).toEqual(['air', { total: 3, ok: 2, samples: 1 }]);

    const entries = await new DayBuffer(join(root, 'buffer')).read((await new DayBuffer(join(root, 'buffer')).days())[0]);

    expect(entries.map((e) => `${e.type}/${e.id}`)).toEqual(['climate/3', 'climate/d10587']);
  });

  it('skips impossible parking counts and fails the run only when every parking fails', async () => {
    const fakes = new Fakes();
    let calls = 0;
    const jobs = service(fakes, { BUFFER_DIR: join(root, 'buffer') }, async () => {
      calls++;

      return [controlla(10, 65), controlla(70, 65), 'maintenance', controlla(0, 120)][calls - 1] ?? '';
    });

    await jobs.run('parking');

    expect(fakes.parking.map((p) => [p.parkingId, p.available, p.capacity])).toEqual([
      [1, 10, 65],
      [4, 0, 120],
    ]);

    const down = service(fakes, { BUFFER_DIR: join(root, 'buffer') }, async () => Promise.reject(new Error('timeout')));

    await expect(down.run('parking')).rejects.toThrow('all 4 fetches failed');
    expect(fakes.failures).toEqual(['parking']);
  });

  it('refuses to export pending days without R2 and bb-data settings', async () => {
    const fakes = new Fakes();
    const buffer = new DayBuffer(join(root, 'buffer'));

    await buffer.append('parking', '1', { date: '2026-10-25T10:00:00.000Z', availableSpots: 1, totalSpots: 2 });

    const jobs = service(fakes, { BUFFER_DIR: join(root, 'buffer') }, async () => '');

    await expect(jobs.run('export', new Date('2026-10-26T00:45:00Z'))).rejects.toThrow('export needs R2 and bb-data settings');
    await jobs.run('export', new Date('2026-10-25T23:00:00Z'));
    expect(fakes.successes).toEqual([['export', { days: 0, files: 0 }]]);
  });

  describe('export', () => {
    let server: Server;
    const puts: { url: string; auth: string; body: string }[] = [];

    beforeAll(async () => {
      server = createServer((req: IncomingMessage, res) => {
        let body = '';

        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          puts.push({ url: `${req.method} ${req.url}`, auth: req.headers.authorization ?? '', body });
          res.end();
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it('puts each day file to R2, commits the run to bb-data and prunes old buffer days', async () => {
      const fakes = new Fakes();
      const origin = seedOrigin(root);
      const buffer = new DayBuffer(join(root, 'buffer'));

      await buffer.append('parking', '2', { date: '2026-10-10T10:00:00.000Z', availableSpots: 1, totalSpots: 2 });
      await buffer.append('parking', '2', { date: '2026-10-24T10:00:00.000Z', availableSpots: 3, totalSpots: 9 });
      await buffer.append('parking', '2', { date: '2026-10-25T10:00:00.000Z', availableSpots: 4, totalSpots: 9 });
      await buffer.append('parking', '2', { date: '2026-10-26T00:01:00.000Z', availableSpots: 5, totalSpots: 9 });
      fakes.through = '2026-10-10';

      const jobs = service(
        fakes,
        {
          BUFFER_DIR: join(root, 'buffer'),
          R2_ENDPOINT: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
          R2_BUCKET: 'bb-data',
          R2_ACCESS_KEY_ID: 'key',
          R2_SECRET_ACCESS_KEY: 'secret',
          BB_DATA_REPO: `file://${origin}`,
          BB_DATA_DIR: join(root, 'clone'),
          BB_DATA_GIT_NAME: 'bb-hub',
          BB_DATA_GIT_EMAIL: 'bb-hub@example.invalid',
        },
        async () => '',
      );

      await jobs.run('export', new Date('2026-10-26T00:45:00Z'));

      expect(puts.map((p) => p.url)).toEqual(['PUT /bb-data/data/parking/2/2026-10-24.json', 'PUT /bb-data/data/parking/2/2026-10-25.json']);
      expect(puts.every((p) => p.auth.startsWith('AWS4-HMAC-SHA256 Credential=key/'))).toBe(true);
      expect(puts[1].body).toBe(JSON.stringify([{ id: '2', date: '2026-10-25T10:00:00.000Z', availableSpots: 4, totalSpots: 9 }], null, 2));
      expect(fakes.successes).toEqual([['export', { through: '2026-10-25', days: 2, files: 2, dropped: 0, bbData: 'pushed' }]]);
      expect(git(origin, 'log', '-1', '--format=%s', '--name-only')).toBe('chore(data): 2026-10-25\n\ndata/parking/2/2026-10-24.json\ndata/parking/2/2026-10-25.json\n');
      expect(await buffer.days()).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
      expect(readFileSync(join(root, 'buffer/2026-10-26/parking--2.ndjson'), 'utf8')).toContain('"availableSpots":5');
    });
  });
});
