import { parseArgs } from 'node:util';

import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { AggregatesModule } from '../aggregates/aggregates.module';
import { AggregatesService } from '../aggregates/aggregates.service';
import { AirSample } from '../aggregates/hourly';

import { airSamples, listSources, parkingReadings } from './bb-node-reader';

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
      dir: { type: 'string', multiple: true },
      city: { type: 'string', default: 'Bielsko-Biała' },
      'any-city': { type: 'boolean', default: false },
    },
  });

  if (!values.dir?.length) {
    throw new Error('usage: backfill --dir <tree> [--dir <tree>] [--city <name> | --any-city]');
  }

  const logger = new Logger('Backfill');
  const app = await NestFactory.createApplicationContext(BackfillModule, { logger: ['log', 'warn', 'error'] });
  const aggregates = app.get(AggregatesService);
  const city = values['any-city'] ? undefined : values.city;

  try {
    for (const source of await listSources(values.dir, 'parking')) {
      let counted = 0;

      for (const { files } of source.days) {
        counted += await aggregates.bulkParking(await parkingReadings(source.id, files));
      }

      logger.log(`parking ${source.id}: ${source.days.length} days, ${counted} readings counted`);
    }

    const cutoffs: string[] = [];

    for (const source of await listSources(values.dir, 'climate')) {
      let counted = 0;
      let outside = 0;
      let lastInCity: Date | undefined;
      let newestSample: Date | undefined;
      let batch: AirSample[] = [];

      for (const { files } of source.days) {
        const result = await airSamples(source.id, files, city);

        outside += result.outsideCity;
        lastInCity = result.lastInCity ?? lastInCity;
        for (const sample of result.samples) {
          newestSample = !newestSample || sample.at > newestSample ? sample.at : newestSample;
        }

        batch = batch.concat(result.samples);

        if (batch.length >= 2000) {
          counted += await aggregates.bulkAir(batch);
          batch = [];
        }
      }

      counted += await aggregates.bulkAir(batch);
      cutoffs.push(`| ${source.id} | ${lastInCity?.toISOString() ?? '-'} | ${newestSample?.toISOString() ?? '-'} | ${counted} | ${outside} |`);
      logger.log(`air ${source.id}: ${source.days.length} days, ${counted} samples counted, ${outside} readings outside ${city ?? 'any city'}`);
    }

    process.stdout.write(['| air id | last fetch reporting the city | newest measurement in city | samples counted | fetches outside |', '| --- | --- | --- | --- | --- |', ...cutoffs, ''].join('\n'));
  } finally {
    await app.close();
  }
};

void run().catch((error: unknown) => {
  new Logger('Backfill').error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
