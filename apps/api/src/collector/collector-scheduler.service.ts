import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue, Worker } from 'bullmq';

import { CollectorJobsService } from './collector-jobs.service';
import { CollectorStateService, Source, SOURCES } from './collector-state.service';

export const SCHEDULES: Record<Source, string> = {
  parking: '*/5 * * * *',
  air: '*/5 * * * *',
  discovery: '10 0 * * *',
  export: '45 0 * * *',
};

const QUEUES: Record<Source, string> = {
  parking: 'collector',
  air: 'collector',
  discovery: 'collector',
  export: 'collector-export',
};

const JOB_OPTIONS: Record<Source, JobsOptions> = {
  parking: { removeOnComplete: 20, removeOnFail: 50 },
  air: { removeOnComplete: 20, removeOnFail: 50 },
  discovery: { removeOnComplete: 20, removeOnFail: 50, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
  export: { removeOnComplete: 20, removeOnFail: 50, attempts: 4, backoff: { type: 'exponential', delay: 600_000 } },
};

const DISCOVERY_STALE_MS = 20 * 3_600_000;
export const RESYNC_MS = 60_000;

export interface SchedulerQueue {
  upsertJobScheduler: Queue['upsertJobScheduler'];
  add: Queue['add'];
  close: Queue['close'];
}

export const bootJobs = (lastDiscovery: Date | undefined, now: Date): Source[] => [
  'discovery',
  'parking',
  'air',
  'export',
].filter((source) => source !== 'discovery' || !lastDiscovery || now.getTime() - lastDiscovery.getTime() > DISCOVERY_STALE_MS) as Source[];

export const ensureSchedulers = async (queues: Record<string, SchedulerQueue>): Promise<void> => {
  for (const source of SOURCES) {
    await queues[QUEUES[source]].upsertJobScheduler(source, { pattern: SCHEDULES[source], tz: 'UTC' }, { name: source, opts: JOB_OPTIONS[source] });
  }
};

@Injectable()
export class CollectorSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CollectorSchedulerService.name);
  private queues: Record<string, Queue> = {};
  private workers: Worker[] = [];
  private resync?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly jobs: CollectorJobsService,
    private readonly state: CollectorStateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('COLLECTOR_ENABLED') !== 'true') {
      return;
    }

    const connection = { url: this.config.getOrThrow<string>('REDIS_URL') };

    for (const name of new Set(Object.values(QUEUES))) {
      this.queues[name] = new Queue(name, { connection });

      const worker = new Worker(name, (job) => this.jobs.run(job.name as Source), { connection, concurrency: 1 });

      worker.on('error', (error) => this.logger.error(`worker ${name}: ${error.message}`));
      this.workers.push(worker);
    }

    await ensureSchedulers(this.queues);

    for (const source of bootJobs(await this.state.lastSuccess('discovery'), new Date())) {
      await this.queues[QUEUES[source]].add(source, {}, JOB_OPTIONS[source]);
    }

    this.resync = setInterval(() => {
      ensureSchedulers(this.queues).catch((error: Error) => this.logger.warn(`scheduler resync: ${error.message}`));
    }, RESYNC_MS);
    this.resync.unref();
    this.logger.log('collector schedules registered');
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.resync);
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(Object.values(this.queues).map((q) => q.close()));
  }
}
