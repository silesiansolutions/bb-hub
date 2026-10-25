import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AirSample, ParkingReading } from '../aggregates/hourly';
import { isInCity, parseSyngeos } from '../providers/syngeos';

interface RawParking {
  date?: string;
  availableSpots?: number | string;
  totalSpots?: number | string;
}

interface RawAir {
  date?: string;
  originalData?: unknown;
}

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export interface SourceDays {
  id: number;
  days: { day: string; files: string[] }[];
}

const listDir = async (dir: string) => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};

export const listSources = async (roots: string[], type: string): Promise<SourceDays[]> => {
  const byId = new Map<number, Map<string, string[]>>();

  for (const root of roots) {
    for (const entry of await listDir(join(root, type))) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
        continue;
      }

      const id = Number(entry.name);
      const days = byId.get(id) ?? new Map<string, string[]>();

      for (const file of await readdir(join(root, type, entry.name))) {
        const day = file.match(DAY_FILE)?.[1];

        if (day) {
          days.set(day, [...(days.get(day) ?? []), join(root, type, entry.name, file)]);
        }
      }

      byId.set(id, days);
    }
  }

  return [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, days]) => ({
      id,
      days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, files]) => ({ day, files })),
    }));
};

const readRows = async <T extends { date?: string }>(files: string[]): Promise<T[]> => {
  const rows: T[] = [];

  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));

    if (Array.isArray(parsed)) {
      rows.push(...(parsed as T[]));
    }
  }

  const seen = new Set<string>();

  return rows
    .filter((row) => typeof row.date === 'string' && !Number.isNaN(new Date(row.date).getTime()))
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .filter((row) => !seen.has(row.date!) && seen.add(row.date!) !== undefined);
};

export const parkingReadings = async (id: number, files: string[]): Promise<ParkingReading[]> => {
  const rows = await readRows<RawParking>(files);

  return rows.flatMap((row) => {
    const available = Number(row.availableSpots);
    const capacity = Number(row.totalSpots);

    if (!Number.isFinite(available) || !Number.isFinite(capacity)) {
      return [];
    }

    return [{ parkingId: id, at: new Date(row.date!), available, capacity }];
  });
};

export interface AirDayResult {
  samples: AirSample[];
  outsideCity: number;
  lastInCity?: Date;
}

export const airSamples = async (id: number, files: string[], city: string | undefined): Promise<AirDayResult> => {
  const rows = await readRows<RawAir>(files);
  const samples: AirSample[] = [];
  let outsideCity = 0;
  let lastInCity: Date | undefined;

  for (const row of rows) {
    const parsed = parseSyngeos(row.originalData);

    if (!parsed || parsed.values.length === 0) {
      continue;
    }

    if (city && !isInCity(parsed, city)) {
      outsideCity++;
      continue;
    }

    const fetchedAt = new Date(row.date!);

    lastInCity = fetchedAt;

    for (const { metric, at, value } of parsed.values) {
      samples.push({ deviceId: id, metric, at: at && at <= fetchedAt ? at : fetchedAt, value });
    }
  }

  return { samples, outsideCity, lastInCity };
};
