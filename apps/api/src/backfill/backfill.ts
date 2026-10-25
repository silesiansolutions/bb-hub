import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { AggregatesModule } from '../aggregates/aggregates.module';
import { AggregatesService } from '../aggregates/aggregates.service';
import { AirReading } from '../aggregates/hourly';

import { airReadings, listSources, parkingReadings } from './bb-node-reader';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGODB_URI') }),
    }),
    AggregatesModule,
  ],
})
class BackfillModule {}

const run = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      city: { type: 'string', default: 'Bielsko-Biała' },
      'any-city': { type: 'boolean', default: false },
    },
  });

  if (!values.dir) {
    throw new Error('usage: backfill --dir <backup-data> [--city <name> | --any-city]');
  }

  const logger = new Logger('Backfill');
  const app = await NestFactory.createApplicationContext(BackfillModule, { logger: ['log', 'warn', 'error'] });
  const aggregates = app.get(AggregatesService);
  const city = values['any-city'] ? undefined : values.city;

  try {
    for (const source of await listSources(join(values.dir, 'parking'))) {
      let counted = 0;

      for (const file of source.files) {
        counted += await aggregates.bulkParking(await parkingReadings(source.id, file));
      }

      logger.log(`parking ${source.id}: ${source.files.length} days, ${counted} readings counted`);
    }

    for (const source of await listSources(join(values.dir, 'climate'))) {
      let counted = 0;
      let outside = 0;
      let batch: AirReading[] = [];

      for (const file of source.files) {
        const { readings, outsideCity } = await airReadings(source.id, file, city);

        outside += outsideCity;
        batch = batch.concat(readings);

        if (batch.length >= 500) {
          counted += await aggregates.bulkAir(batch);
          batch = [];
        }
      }

      counted += await aggregates.bulkAir(batch);
      logger.log(`air ${source.id}: ${source.files.length} days, ${counted} readings counted, ${outside} outside ${city ?? 'any city'}`);
    }
  } finally {
    await app.close();
  }
};

void run().catch((error: unknown) => {
  new Logger('Backfill').error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
