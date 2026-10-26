import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { DayFile } from './day-files';

const run = promisify(execFile);
const BRANCH = 'master';
const ATTEMPTS = 3;

export const GITHUB_KNOWN_HOSTS = [
  'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl',
  'github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=',
].join('\n');

export interface BbDataConfig {
  repo: string;
  dir: string;
  sshKey?: string;
  name: string;
  email: string;
}

export class BbDataRepo {
  constructor(private readonly config: BbDataConfig) {}

  async publish(files: DayFile[], message: string): Promise<'pushed' | 'unchanged'> {
    const outside = files.find((f) => !/^data\/(parking|climate|source)\/[0-9a-z]+\/\d{4}-\d{2}-\d{2}\.json$/.test(f.path));

    if (outside) {
      throw new Error(`refusing to write ${outside.path} outside data/`);
    }

    const env = await this.env();

    await this.ensureClone(env);

    for (let attempt = 1; ; attempt++) {
      await this.git(env, 'fetch', '--depth', '1', 'origin', BRANCH);
      await this.git(env, 'reset', '--hard', '-q', 'FETCH_HEAD');

      for (const file of files) {
        await mkdir(dirname(join(this.config.dir, file.path)), { recursive: true });
        await writeFile(join(this.config.dir, file.path), file.text, 'utf8');
      }

      await this.git(env, 'add', '--sparse', '--', ...files.map((f) => f.path));

      if (await this.nothingStaged(env)) {
        await this.git(env, 'sparse-checkout', 'reapply');

        return 'unchanged';
      }

      await this.git(env, 'commit', '-q', '-m', message);

      try {
        await this.git(env, 'push', '-q', 'origin', `HEAD:${BRANCH}`);
        await this.git(env, 'sparse-checkout', 'reapply');

        return 'pushed';
      } catch (error) {
        if (attempt >= ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  private async ensureClone(env: NodeJS.ProcessEnv): Promise<void> {
    await this.removeLocks();

    try {
      await this.git(env, 'rev-parse', '--verify', '-q', 'HEAD');
    } catch {
      await rm(this.config.dir, { recursive: true, force: true });
      await mkdir(dirname(this.config.dir), { recursive: true });
      await run('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', BRANCH, this.config.repo, this.config.dir], { env, timeout: 300_000 });
    }

    await this.git(env, 'checkout', '-q', '-B', BRANCH);
  }

  private async removeLocks(): Promise<void> {
    let names: string[];

    try {
      names = await readdir(join(this.config.dir, '.git'), { recursive: true });
    } catch {
      return;
    }

    for (const name of names.filter((n) => n.endsWith('.lock') && !n.startsWith('objects'))) {
      await rm(join(this.config.dir, '.git', name), { force: true });
    }
  }

  private async nothingStaged(env: NodeJS.ProcessEnv): Promise<boolean> {
    try {
      await this.git(env, 'diff', '--cached', '--quiet');

      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 1) {
        return false;
      }

      throw error;
    }
  }

  private async env(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_AUTHOR_NAME: this.config.name,
      GIT_AUTHOR_EMAIL: this.config.email,
      GIT_COMMITTER_NAME: this.config.name,
      GIT_COMMITTER_EMAIL: this.config.email,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CEILING_DIRECTORIES: dirname(this.config.dir),
    };

    if (this.config.sshKey) {
      const knownHosts = `${this.config.dir}.known_hosts`;
      const key = `${this.config.dir}.key`;

      await mkdir(dirname(knownHosts), { recursive: true });
      await writeFile(knownHosts, `${GITHUB_KNOWN_HOSTS}\n`, 'utf8');
      await copyFile(this.config.sshKey, key);
      await chmod(key, 0o600);
      env.GIT_SSH_COMMAND = `ssh -i ${key} -o IdentitiesOnly=yes -o UserKnownHostsFile=${knownHosts} -o StrictHostKeyChecking=yes`;
    }

    return env;
  }

  private async git(env: NodeJS.ProcessEnv, ...args: string[]): Promise<string> {
    const { stdout } = await run('git', ['-C', this.config.dir, ...args], { env, timeout: 120_000 });

    return stdout;
  }
}
