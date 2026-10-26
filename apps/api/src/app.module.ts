import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AggregatesModule } from './aggregates/aggregates.module';
import { AirController } from './air/air.controller';
import { CollectorModule } from './collector/collector.module';
import { CacheInterceptor } from './common/cache';
import { clientKey, OriginGuard } from './common/origin.guard';
import { validateEnv } from './config/env';
import { HealthController, RedisProbe } from './health/health.controller';
import { ParkingController } from './parking/parking.controller';
import { StatsController } from './stats/stats.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        getTracker: (req: Record<string, unknown>) =>
          clientKey(
            (req.headers ?? {}) as Record<string, string | undefined>,
            (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress,
            config.get<string>('ORIGIN_SECRET'),
          ),
      }),
    }),
    TerminusModule,
    AggregatesModule,
    CollectorModule,
  ],
  controllers: [ParkingController, AirController, StatsController, HealthController],
  providers: [
    RedisProbe,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: CacheInterceptor },
  ],
})
export class AppModule {}
