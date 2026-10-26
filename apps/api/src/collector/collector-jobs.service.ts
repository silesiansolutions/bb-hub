import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AggregatesService } from '../aggregates/aggregates.service';
import { airIdForDevice, AirSource, PARKINGS } from '../catalog/catalog';
import { parseControlla } from '../providers/controlla';
import { acceptSamples, CITY, cityMatches, isInCity, parseSyngeos } from '../providers/syngeos';

import { BbDataRepo } from './bb-data';
import { DayBuffer, utcDay } from './buffer';
import { CollectorStateService, Source } from './collector-state.service';
import { buildDayFiles, DayFile, FIRST_WRITABLE_DAY } from './day-files';
import { R2Store } from './r2';

export const SYNGEOS_DEVICES_URL = 'https://api.syngeos.pl/api/public/devices';
export const syngeosDeviceUrl = (device: number): string => `https://api.syngeos.pl/api/public/data/device/${device}`;

const USER_AGENT = 'bb-hub (+https://bb.silesiansolutions.com)';
const EXPORT_NOT_BEFORE_MINUTES = 30;
const KEEP_EXPORTED_DAYS = 7;
const DAY_MS = 86_400_000;

export type Fetcher = (url: string) => Promise<string>;

export const fetchText: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });

  if (!res.ok) {
    throw new Error(`${url} answered ${res.status}`);
  }

  return res.text();
};

interface SyngeosListedDevice {
  id?: unknown;
  city?: string;
  address?: string;
}

export const exportableDays = (bufferDays: string[], exportedThrough: string | undefined, now: Date): string[] => {
  const today = utcDay(now);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const limit = minutes < EXPORT_NOT_BEFORE_MINUTES ? utcDay(new Date(now.getTime() - DAY_MS)) : today;

  return bufferDays.filter((day) => day >= FIRST_WRITABLE_DAY && day < limit && (!exportedThrough || day > exportedThrough));
};

@Injectable()
export class CollectorJobsService {
  private readonly logger = new Logger(CollectorJobsService.name);
  private readonly buffer: DayBuffer;
  private readonly r2?: R2Store;
  private readonly bbData?: BbDataRepo;
  fetcher: Fetcher = fetchText;

  constructor(
    config: ConfigService,
    private readonly aggregates: AggregatesService,
    private readonly state: CollectorStateService,
  ) {
    this.buffer = new DayBuffer(config.get<string>('BUFFER_DIR') ?? 'buffer');

    const endpoint = config.get<string>('R2_ENDPOINT');
    const bucket = config.get<string>('R2_BUCKET');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');

    if (endpoint && bucket && accessKeyId && secretAccessKey) {
      this.r2 = new R2Store({ endpoint, bucket, accessKeyId, secretAccessKey });
    }

    const repo = config.get<string>('BB_DATA_REPO');
    const dir = config.get<string>('BB_DATA_DIR');
    const name = config.get<string>('BB_DATA_GIT_NAME');
    const email = config.get<string>('BB_DATA_GIT_EMAIL');

    if (repo && dir && name && email) {
      this.bbData = new BbDataRepo({ repo, dir, name, email, sshKey: config.get<string>('BB_DATA_SSH_KEY') });
    }
  }

  async run(source: Source, now = new Date()): Promise<void> {
    try {
      const detail = await this.jobs[source](now);

      await this.state.success(source, now, detail);
      this.logger.log(`${source}: ${JSON.stringify(detail)}`);
    } catch (error) {
      await this.state.failure(source, now);
      this.logger.error(`${source} failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private readonly jobs: Record<Source, (now: Date) => Promise<Record<string, number | string>>> = {
    parking: (now) => this.pollParking(now),
    air: (now) => this.pollAir(now),
    discovery: (now) => this.discover(now),
    export: (now) => this.exportDays(now),
  };

  private async pollParking(now: Date): Promise<Record<string, number>> {
    let ok = 0;

    for (const parking of PARKINGS) {
      const at = new Date();

      try {
        const reading = parseControlla(await this.fetcher(parking.url));

        if (!reading || reading.available > reading.capacity) {
          continue;
        }

        await this.buffer.append('parking', String(parking.id), { date: at.toISOString(), availableSpots: reading.available, totalSpots: reading.capacity });
        ok++;
        await this.aggregates.recordParking({ parkingId: parking.id, at, available: reading.available, capacity: reading.capacity });
      } catch (error) {
        this.logger.warn(`parking ${parking.id}: ${(error as Error).message}`);
      }
    }

    return this.outcome('parking', PARKINGS.length, ok, now);
  }

  private async pollAir(now: Date): Promise<Record<string, number>> {
    const devices = await this.aggregates.pollableAir();
    let ok = 0;
    let samples = 0;

    for (const device of devices) {
      const at = new Date();

      try {
        const raw = await this.fetcher(syngeosDeviceUrl(device.device));
        const body = JSON.parse(raw) as unknown;

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('response is not a device object');
        }

        await this.buffer.append('climate', String(device.id), { date: at.toISOString(), raw });

        const parsed = parseSyngeos(body);

        ok++;

        if (parsed && isInCity(parsed, CITY)) {
          const accepted = acceptSamples(device.id, parsed.values, at);

          samples += accepted.samples.length;
          await this.aggregates.recordAir(accepted.samples);
        }
      } catch (error) {
        this.logger.warn(`air ${device.id}: ${(error as Error).message}`);
      }
    }

    return { ...this.outcome('air', devices.length, ok, now), samples };
  }

  private async discover(now: Date): Promise<Record<string, number>> {
    const raw = await this.fetcher(SYNGEOS_DEVICES_URL);
    const list = JSON.parse(raw) as unknown;

    if (!Array.isArray(list)) {
      throw new Error('device list is not an array');
    }

    if (!(await this.buffer.has(utcDay(now), 'source', '1'))) {
      await this.buffer.append('source', '1', { date: now.toISOString(), raw });
    }

    const found: AirSource[] = (list as SyngeosListedDevice[])
      .filter((d) => Number.isInteger(d.id) && cityMatches(d.city, CITY))
      .map((d) => ({ id: airIdForDevice(d.id as number), provider: 'syngeos', device: d.id as number, name: d.address?.trim() || `Syngeos ${String(d.id)}` }));

    await this.aggregates.saveDiscovery(found, now);

    return { listed: list.length, found: found.length };
  }

  private async exportDays(now: Date): Promise<Record<string, string | number>> {
    const previous = await this.state.exportedThrough();
    const days = exportableDays(await this.buffer.days(), previous, now);

    if (days.length === 0) {
      return { ...(previous ? { through: previous } : {}), days: 0, files: 0 };
    }

    if (!this.r2 || !this.bbData) {
      throw new Error('export needs R2 and bb-data settings');
    }

    const files: DayFile[] = [];
    let dropped = 0;

    for (const day of days) {
      const entries = await this.buffer.read(day);

      dropped += entries.reduce((sum, e) => sum + e.dropped, 0);
      files.push(...buildDayFiles(day, entries));
    }

    for (const file of files) {
      await this.r2.put(file);
    }

    const through = days[days.length - 1];
    const pushed = files.length === 0 ? 'unchanged' : await this.bbData.publish(files, `chore(data): ${through}`);

    for (const day of await this.buffer.days()) {
      if (day < utcDay(new Date(Date.parse(through) - KEEP_EXPORTED_DAYS * DAY_MS))) {
        await this.buffer.remove(day);
      }
    }

    return { through, days: days.length, files: files.length, dropped, bbData: pushed };
  }

  private outcome(source: Source, total: number, ok: number, now: Date): Record<string, number> {
    if (total > 0 && ok === 0) {
      throw new Error(`${source}: all ${total} fetches failed at ${now.toISOString()}`);
    }

    return { total, ok };
  }
}
