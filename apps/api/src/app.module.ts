import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AggregatesModule } from './aggregates/aggregates.module';
import { AirController } from './air/air.controller';
import { CacheInterceptor } from './common/cache';
import { OriginGuard } from './common/origin.guard';
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
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      getTracker: (req: Record<string, unknown>) => {
        const headers = req.headers as Record<string, string | undefined> | undefined;
        const socket = req.socket as { remoteAddress?: string } | undefined;

        return headers?.['cf-connecting-ip'] ?? socket?.remoteAddress ?? 'unknown';
      },
    }),
    TerminusModule,
    AggregatesModule,
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
