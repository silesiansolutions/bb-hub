import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BbDataRepo } from './bb-data';
import { DayBuffer } from './buffer';
import { buildDayFiles, DayFile } from './day-files';
import { git, seedOrigin } from '../../test/git';

const VALIDATOR = process.env.BB_DATA_VALIDATOR;

const validate = (files: DayFile[]): string => {
  const root = mkdtempSync(join(tmpdir(), 'bb-validate-'));

  try {
    for (const file of files) {
      mkdirSync(dirname(join(root, file.path)), { recursive: true });
      writeFileSync(join(root, file.path), file.text);
    }

    return execFileSync('node', [VALIDATOR!, ...files.map((f) => f.path)], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe('day export', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bb-export-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const fill = async (buffer: DayBuffer) => {
    await buffer.append('parking', '1', { date: '2026-10-25T10:05:00.000Z', availableSpots: 12, totalSpots: 65 });
    await buffer.append('parking', '1', { date: '2026-10-25T00:00:00.000Z', availableSpots: 40, totalSpots: 65 });
    await buffer.append('parking', '1', { date: '2026-10-26T00:00:01.000Z', availableSpots: 41, totalSpots: 65 });
    await buffer.append('climate', 'd10587', { date: '2026-10-25T23:59:59.999Z', raw: '{"id":10587,"city":"Bielsko-Biała","sensors":[{"name":"pm10","data":[{"read_at":"2026-10-25T23:55:00+01:00","value":12.5}]}]}' });
    await buffer.append('source', '1', { date: '2026-10-25T00:10:00.000Z', raw: '[{"id":10587,"city":"Bielsko-Biała"}]' });
    writeFileSync(join(root, 'buffer/2026-10-25/climate--d10587.ndjson'), '{"date":"2026-10-25T23:00:00.000Z","ra', { flag: 'a' });
  };

  it('writes the bb-data contract byte for byte, one sorted file per source and UTC day', async () => {
    const buffer = new DayBuffer(join(root, 'buffer'));

    await fill(buffer);

    const files = buildDayFiles('2026-10-25', await buffer.read('2026-10-25'));

    expect(files.map((f) => f.path)).toEqual(['data/climate/d10587/2026-10-25.json', 'data/parking/1/2026-10-25.json', 'data/source/1/2026-10-25.json']);

    const parking = files[1].text;

    expect(parking).toBe(
      JSON.stringify(
        [
          { id: '1', date: '2026-10-25T00:00:00.000Z', availableSpots: 40, totalSpots: 65 },
          { id: '1', date: '2026-10-25T10:05:00.000Z', availableSpots: 12, totalSpots: 65 },
        ],
        null,
        2,
      ),
    );
    expect(parking.endsWith('\n')).toBe(false);
    expect(files[0].text).toContain('"city": "Bielsko-Biała"');
    expect(files[0].text).toContain('"read_at": "2026-10-25T23:55:00+01:00"');
    expect(files[0].text).not.toContain('\\u');
    expect(buildDayFiles('2026-10-25', await buffer.read('2026-10-25'))).toEqual(files);
  });

  (VALIDATOR ? it : it.skip)('passes the bb-data layout validator', async () => {
    const buffer = new DayBuffer(join(root, 'buffer'));

    await fill(buffer);

    const files = [...buildDayFiles('2026-10-25', await buffer.read('2026-10-25')), ...buildDayFiles('2026-10-26', await buffer.read('2026-10-26'))];

    expect(validate(files)).toContain('4 files checked, 0 with errors');
  });

  it('refuses the frozen days', () => {
    expect(() => buildDayFiles('2025-06-13', [])).toThrow('days up to 2025-06-13 are frozen');
    expect(buildDayFiles('2025-06-14', [])).toEqual([]);
  });

  it('commits whole files to bb-data once, from a shallow sparse clone', async () => {
    const origin = seedOrigin(root);
    const repo = new BbDataRepo({ repo: `file://${origin}`, dir: join(root, 'clone'), name: 'bb-hub', email: 'bb-hub@example.invalid' });
    const files = [{ path: 'data/parking/1/2026-10-25.json', text: '[\n  {\n    "id": "1"\n  }\n]' }];

    await expect(repo.publish(files, 'chore(data): 2026-10-25')).resolves.toBe('pushed');
    expect(git(origin, 'log', '-1', '--format=%s %an')).toBe('chore(data): 2026-10-25 bb-hub\n');
    expect(git(origin, 'show', 'master:data/parking/1/2026-10-25.json')).toBe(files[0].text);
    expect(git(origin, 'show', 'master:data/parking/1/2025-06-13.json')).toBe('[]');
    expect(existsSync(join(root, 'clone/data/parking/1/2025-06-13.json'))).toBe(false);

    await expect(repo.publish(files, 'chore(data): 2026-10-25')).resolves.toBe('unchanged');
    expect(git(origin, 'rev-list', '--count', 'master')).toBe('2\n');

    git(root, 'clone', '-q', origin, 'other');
    writeFileSync(join(root, 'other/README.md'), '# bb-data, edited\n');
    git(join(root, 'other'), 'commit', '-q', '-am', 'docs: edit');
    git(join(root, 'other'), 'push', '-q', 'origin', 'master');

    await expect(repo.publish([{ path: 'data/parking/1/2026-10-26.json', text: '[]' }], 'chore(data): 2026-10-26')).resolves.toBe('pushed');
    expect(git(origin, 'log', '--format=%s', 'master')).toBe('chore(data): 2026-10-26\ndocs: edit\nchore(data): 2026-10-25\nseed\n');
  });
});
