import { Module } from '@nestjs/common';

import { AggregatesModule } from '../aggregates/aggregates.module';

import { CollectorJobsService } from './collector-jobs.service';
import { CollectorSchedulerService } from './collector-scheduler.service';
import { CollectorStateService } from './collector-state.service';

@Module({
  imports: [AggregatesModule],
  providers: [CollectorStateService, CollectorJobsService, CollectorSchedulerService],
  exports: [CollectorStateService, CollectorJobsService],
})
export class CollectorModule {}
