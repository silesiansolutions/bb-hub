import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export type DataType = 'parking' | 'climate' | 'source';

export interface ParkingLine {
  date: string;
  availableSpots: number;
  totalSpots: number;
}

export interface RawLine {
  date: string;
  raw: string;
}

export type BufferLine = ParkingLine | RawLine;

export interface BufferEntry {
  type: DataType;
  id: string;
  lines: BufferLine[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FILE = /^(parking|climate|source)--([0-9a-z]+)\.ndjson$/;

export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

export class DayBuffer {
  constructor(private readonly dir: string) {}

  async append(type: DataType, id: string, line: BufferLine): Promise<void> {
    const day = join(this.dir, utcDay(new Date(line.date)));

    await mkdir(day, { recursive: true });
    await appendFile(join(day, `${type}--${id}.ndjson`), `${JSON.stringify(line)}\n`, 'utf8');
  }

  async has(day: string, type: DataType, id: string): Promise<boolean> {
    try {
      return (await readdir(join(this.dir, day))).includes(`${type}--${id}.ndjson`);
    } catch {
      return false;
    }
  }

  async days(): Promise<string[]> {
    try {
      return (await readdir(this.dir)).filter((name) => DAY.test(name)).sort();
    } catch {
      return [];
    }
  }

  async read(day: string): Promise<BufferEntry[]> {
    const entries: BufferEntry[] = [];

    for (const name of (await readdir(join(this.dir, day))).sort()) {
      const match = FILE.exec(name);

      if (!match) {
        continue;
      }

      const text = await readFile(join(this.dir, day, name), 'utf8');
      const lines = text.split('\n').flatMap((line) => {
        try {
          return line ? [JSON.parse(line) as BufferLine] : [];
        } catch {
          return [];
        }
      });

      entries.push({ type: match[1] as DataType, id: match[2], lines });
    }

    return entries;
  }

  async remove(day: string): Promise<void> {
    await rm(join(this.dir, day), { recursive: true, force: true });
  }
}
