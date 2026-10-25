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

const READ_AT_TOLERANCE_MS = 5 * 60_000;

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

export interface Dropped {
  noDate: number;
  duplicate: number;
  noValue: number;
  unknownSensor: number;
  nonNumeric: number;
  noReadAt: number;
  futureReadAt: number;
  unknownNames: string[];
}

export const emptyDropped = (): Dropped => ({ noDate: 0, duplicate: 0, noValue: 0, unknownSensor: 0, nonNumeric: 0, noReadAt: 0, futureReadAt: 0, unknownNames: [] });

export const addDropped = (total: Dropped, more: Dropped): Dropped => ({
  noDate: total.noDate + more.noDate,
  duplicate: total.duplicate + more.duplicate,
  noValue: total.noValue + more.noValue,
  unknownSensor: total.unknownSensor + more.unknownSensor,
  nonNumeric: total.nonNumeric + more.nonNumeric,
  noReadAt: total.noReadAt + more.noReadAt,
  futureReadAt: total.futureReadAt + more.futureReadAt,
  unknownNames: [...new Set([...total.unknownNames, ...more.unknownNames])].sort(),
});

const readRows = async <T extends { date?: string }>(files: string[]): Promise<{ rows: T[]; dropped: Dropped }> => {
  const all: T[] = [];

  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));

    if (Array.isArray(parsed)) {
      all.push(...(parsed as T[]));
    }
  }

  const dated = all.filter((row) => typeof row.date === 'string' && !Number.isNaN(new Date(row.date).getTime()));
  const seen = new Set<string>();
  const rows = dated
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .filter((row) => !seen.has(row.date!) && seen.add(row.date!) !== undefined);

  return { rows, dropped: { noDate: all.length - dated.length, duplicate: dated.length - rows.length, noValue: 0, unknownSensor: 0, nonNumeric: 0, noReadAt: 0, futureReadAt: 0, unknownNames: [] } };
};

export interface ParkingDayResult {
  readings: ParkingReading[];
  dropped: Dropped;
}

export const parkingReadings = async (id: number, files: string[]): Promise<ParkingDayResult> => {
  const { rows, dropped } = await readRows<RawParking>(files);
  const readings = rows.flatMap((row) => {
    const available = Number(row.availableSpots);
    const capacity = Number(row.totalSpots);

    if (!Number.isFinite(available) || !Number.isFinite(capacity)) {
      return [];
    }

    return [{ parkingId: id, at: new Date(row.date!), available, capacity }];
  });

  return { readings, dropped: { ...dropped, noValue: rows.length - readings.length } };
};

export interface AirDayResult {
  samples: AirSample[];
  outsideCity: number;
  lastInCity?: Date;
  dropped: Dropped;
}

export const airSamples = async (id: number, files: string[], city: string | undefined): Promise<AirDayResult> => {
  const { rows, dropped } = await readRows<RawAir>(files);
  const samples: AirSample[] = [];
  let outsideCity = 0;
  let noValue = 0;
  let unknownSensor = 0;
  let nonNumeric = 0;
  let noReadAt = 0;
  let futureReadAt = 0;
  const unknownNames = new Set<string>();
  let lastInCity: Date | undefined;

  for (const row of rows) {
    const parsed = parseSyngeos(row.originalData);

    unknownSensor += parsed?.unknownSensors.length ?? 0;
    nonNumeric += parsed?.nonNumeric ?? 0;
    parsed?.unknownSensors.forEach((name) => unknownNames.add(name));

    if (!parsed || parsed.values.length === 0) {
      noValue++;
      continue;
    }

    if (city && !isInCity(parsed, city)) {
      outsideCity++;
      continue;
    }

    const fetchedAt = new Date(row.date!);

    lastInCity = fetchedAt;

    for (const { metric, at, value } of parsed.values) {
      if (!at) {
        noReadAt++;
      } else if (at.getTime() > fetchedAt.getTime() + READ_AT_TOLERANCE_MS) {
        futureReadAt++;
      } else {
        samples.push({ deviceId: id, metric, at, value });
      }
    }
  }

  return { samples, outsideCity, lastInCity, dropped: { ...dropped, noValue, unknownSensor, nonNumeric, noReadAt, futureReadAt, unknownNames: [...unknownNames].sort() } };
};
