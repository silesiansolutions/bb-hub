import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';

import { CollectorJobsService } from './collector-jobs.service';
import { CollectorStateService, Source, SOURCES } from './collector-state.service';

export const QUEUE = 'collector';

export const SCHEDULES: Record<Source, string> = {
  parking: '*/5 * * * *',
  air: '*/5 * * * *',
  discovery: '10 0 * * *',
  export: '45 0 * * *',
};

const DISCOVERY_STALE_MS = 20 * 3_600_000;
const KEEP_JOBS = { removeOnComplete: 20, removeOnFail: 50 };

export const bootJobs = (lastDiscovery: Date | undefined, now: Date): Source[] => [
  'discovery',
  'parking',
  'air',
  'export',
].filter((source) => source !== 'discovery' || !lastDiscovery || now.getTime() - lastDiscovery.getTime() > DISCOVERY_STALE_MS) as Source[];

@Injectable()
export class CollectorSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CollectorSchedulerService.name);
  private queue?: Queue;
  private worker?: Worker;

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

    this.queue = new Queue(QUEUE, { connection });
    this.worker = new Worker(QUEUE, (job) => this.jobs.run(job.name as Source), { connection, concurrency: 1 });
    this.worker.on('error', (error) => this.logger.error(`worker: ${error.message}`));

    for (const source of SOURCES) {
      await this.queue.upsertJobScheduler(source, { pattern: SCHEDULES[source], tz: 'UTC' }, { name: source, opts: KEEP_JOBS });
    }

    for (const source of bootJobs(await this.state.lastSuccess('discovery'), new Date())) {
      await this.queue.add(source, {}, KEEP_JOBS);
    }

    this.logger.log('collector schedules registered');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
