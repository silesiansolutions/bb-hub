import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IDENTITY = ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid'];

export const git = (cwd: string, ...args: string[]): string => execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8' });

export const seedOrigin = (root: string): string => {
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');

  mkdirSync(origin, { recursive: true });
  git(origin, 'init', '-q', '--bare', '-b', 'master');
  git(origin, 'config', 'uploadpack.allowFilter', 'true');
  mkdirSync(join(seed, 'data/parking/1'), { recursive: true });
  writeFileSync(join(seed, 'README.md'), '# bb-data\n');
  writeFileSync(join(seed, 'data/parking/1/2025-06-13.json'), '[]');
  git(seed, 'init', '-q', '-b', 'master');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'seed');
  git(seed, 'push', '-q', origin, 'master');

  return origin;
};
