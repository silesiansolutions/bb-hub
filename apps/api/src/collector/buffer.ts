import { appendFile, mkdir, open, readdir, readFile, rm } from 'node:fs/promises';
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
  dropped: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FILE = /^(parking|climate|source)--([0-9a-z]+)\.ndjson$/;

export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

const endsTorn = async (path: string): Promise<boolean> => {
  let handle;

  try {
    handle = await open(path, 'r');
  } catch {
    return false;
  }

  try {
    const { size } = await handle.stat();

    if (size === 0) {
      return false;
    }

    const last = Buffer.alloc(1);

    await handle.read(last, 0, 1, size - 1);

    return last[0] !== 0x0a;
  } finally {
    await handle.close();
  }
};

export class DayBuffer {
  private readonly checked = new Set<string>();

  constructor(private readonly dir: string) {}

  async append(type: DataType, id: string, line: BufferLine): Promise<void> {
    const day = join(this.dir, utcDay(new Date(line.date)));
    const path = join(day, `${type}--${id}.ndjson`);

    await mkdir(day, { recursive: true });

    const prefix = !this.checked.has(path) && (await endsTorn(path)) ? '\n' : '';

    this.checked.add(path);

    try {
      await appendFile(path, `${prefix}${JSON.stringify(line)}\n`, 'utf8');
    } catch (error) {
      this.checked.delete(path);
      throw error;
    }
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
      let dropped = 0;
      const lines = text.split('\n').flatMap((line) => {
        try {
          return line ? [JSON.parse(line) as BufferLine] : [];
        } catch {
          dropped++;

          return [];
        }
      });

      entries.push({ type: match[1] as DataType, id: match[2], lines, dropped });
    }

    return entries;
  }

  async remove(day: string): Promise<void> {
    await rm(join(this.dir, day), { recursive: true, force: true });
  }
}
