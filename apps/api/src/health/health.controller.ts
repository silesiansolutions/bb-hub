import { Controller, Get, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';

import { AggregatesService } from '../aggregates/aggregates.service';
import { CollectorStateService } from '../collector/collector-state.service';

@Injectable()
export class RedisProbe implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async ping(): Promise<string> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly aggregates: AggregatesService,
    private readonly redis: RedisProbe,
    private readonly collector: CollectorStateService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.probe('mongo', () => this.aggregates.ping()),
      () => this.probe('redis', () => this.redis.ping()),
      () => this.sources(),
    ]);
  }

  private async sources() {
    const indicator = this.indicators.check('collector');

    try {
      return indicator.up({ sources: await this.collector.view() });
    } catch {
      return indicator.down();
    }
  }

  private async probe(key: string, run: () => Promise<unknown>) {
    const indicator = this.indicators.check(key);

    try {
      await run();

      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
