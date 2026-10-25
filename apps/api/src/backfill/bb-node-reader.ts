import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AirReading, ParkingReading } from '../aggregates/hourly';
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

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

export interface SourceDir {
  id: number;
  files: string[];
}

export const listSources = async (dir: string): Promise<SourceDir[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const sources: SourceDir[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }

    const files = (await readdir(join(dir, entry.name))).filter((f) => DAY_FILE.test(f)).sort();

    sources.push({ id: Number(entry.name), files: files.map((f) => join(dir, entry.name, f)) });
  }

  return sources.sort((a, b) => a.id - b.id);
};

const readArray = async <T>(file: string): Promise<T[]> => {
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));

  return Array.isArray(parsed) ? (parsed as T[]) : [];
};

export const parkingReadings = async (id: number, file: string): Promise<ParkingReading[]> => {
  const rows = await readArray<RawParking>(file);

  return rows.flatMap((row) => {
    const at = row.date ? new Date(row.date) : undefined;
    const available = Number(row.availableSpots);
    const capacity = Number(row.totalSpots);

    if (!at || Number.isNaN(at.getTime()) || !Number.isFinite(available) || !Number.isFinite(capacity)) {
      return [];
    }

    return [{ parkingId: id, at, available, capacity }];
  });
};

export interface AirFileResult {
  readings: AirReading[];
  outsideCity: number;
}

export const airReadings = async (id: number, file: string, city: string | undefined): Promise<AirFileResult> => {
  const rows = await readArray<RawAir>(file);
  const readings: AirReading[] = [];
  let outsideCity = 0;

  for (const row of rows) {
    const parsed = parseSyngeos(row.originalData);

    if (!parsed || Object.keys(parsed.metrics).length === 0) {
      continue;
    }

    if (city && !isInCity(parsed, city)) {
      outsideCity++;
      continue;
    }

    const at = parsed.at ?? (row.date ? new Date(row.date) : undefined);

    if (!at || Number.isNaN(at.getTime())) {
      continue;
    }

    readings.push({ deviceId: id, at, metrics: parsed.metrics });
  }

  return { readings, outsideCity };
};
