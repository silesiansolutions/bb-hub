import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Collection, MongoBulkWriteError, MongoServerError } from 'mongodb';
import { Connection } from 'mongoose';

import { AirId, AirSource } from '../catalog/catalog';

import { AIR_METRICS, AirHourly, AirMetric, AirSample, airUpsert, ParkingHourly, ParkingReading, parkingUpsert, Stat } from './hourly';

const DUPLICATE_KEY = 11000;
const TIMEZONE = 'Europe/Warsaw';

export interface LatestParking {
  _id: string;
  at: Date;
  available: number;
  capacity: number;
}

export interface LatestAir {
  _id: string;
  m: Partial<Record<AirMetric, { v: number; t: Date }>>;
}

interface DiscoveredAir {
  _id: AirId;
  device: number;
  name: string;
  inCity: boolean;
  seenAt: Date;
  firstSeenAt: Date;
}

export interface DailyRow<T> {
  day: Date;
  value: T;
}

const isDuplicate = (error: unknown): boolean => error instanceof MongoServerError && error.code === DUPLICATE_KEY;

@Injectable()
export class AggregatesService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get parking(): Collection<ParkingHourly> {
    return this.connection.collection<ParkingHourly>('parking_hourly') as unknown as Collection<ParkingHourly>;
  }

  private get air(): Collection<AirHourly> {
    return this.connection.collection<AirHourly>('air_hourly') as unknown as Collection<AirHourly>;
  }

  private get devices(): Collection<DiscoveredAir> {
    return this.connection.collection<DiscoveredAir>('air_devices') as unknown as Collection<DiscoveredAir>;
  }

  private latest<T extends { _id: string }>(): Collection<T> {
    return this.connection.collection<T>('latest') as unknown as Collection<T>;
  }

  async recordParking(reading: ParkingReading): Promise<boolean> {
    const counted = await this.upsertOnce(this.parking, parkingUpsert(reading));

    await this.setLatest<LatestParking>(`parking:${reading.parkingId}`, reading.at, {
      available: reading.available,
      capacity: reading.capacity,
    });

    return counted;
  }

  async recordAir(samples: AirSample[]): Promise<number> {
    let counted = 0;

    for (const sample of samples) {
      if (await this.upsertOnce(this.air, airUpsert(sample))) {
        counted++;
      }
    }

    await this.setLatestAir(samples);

    return counted;
  }

  async bulkParking(readings: ParkingReading[]): Promise<number> {
    const counted = await this.bulkOnce(this.parking, readings.map((r) => parkingUpsert(r)));
    const newest = new Map<number, ParkingReading>();

    for (const r of readings) {
      const seen = newest.get(r.parkingId);

      if (!seen || r.at > seen.at) {
        newest.set(r.parkingId, r);
      }
    }

    for (const r of newest.values()) {
      await this.setLatest<LatestParking>(`parking:${r.parkingId}`, r.at, { available: r.available, capacity: r.capacity });
    }

    return counted;
  }

  async bulkAir(samples: AirSample[]): Promise<number> {
    const counted = await this.bulkOnce(this.air, samples.map((s) => airUpsert(s)));

    await this.setLatestAir(samples);

    return counted;
  }

  async latestParking(id: number): Promise<LatestParking | null> {
    return this.latest<LatestParking>().findOne({ _id: `parking:${id}` });
  }

  async latestAir(id: AirId): Promise<LatestAir | null> {
    return this.latest<LatestAir>().findOne({ _id: `air:${id}` });
  }

  async parkingHourly(id: number, from: Date, to: Date): Promise<ParkingHourly[]> {
    return this.parking
      .find({ _id: { $gte: { p: id, h: from }, $lt: { p: id, h: to } } })
      .sort({ _id: 1 })
      .toArray();
  }

  async airHourly(id: AirId, from: Date, to: Date): Promise<AirHourly[]> {
    return this.air
      .find({ _id: { $gte: { s: id, h: from }, $lt: { s: id, h: to } } })
      .sort({ _id: 1 })
      .toArray();
  }

  async parkingDaily(id: number, from: Date, to: Date): Promise<DailyRow<Stat & { cap: number }>[]> {
    const rows = await this.parking
      .aggregate<{ _id: Date; n: number; s: number; lo: number; hi: number; cap: number }>([
        { $match: { _id: { $gte: { p: id, h: from }, $lt: { p: id, h: to } } } },
        {
          $group: {
            _id: { $dateTrunc: { date: '$_id.h', unit: 'day', timezone: TIMEZONE } },
            n: { $sum: '$n' },
            s: { $sum: '$s' },
            lo: { $min: '$lo' },
            hi: { $max: '$hi' },
            cap: { $max: '$cap' },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return rows.map(({ _id, ...value }) => ({ day: _id, value }));
  }

  async airDaily(id: AirId, from: Date, to: Date): Promise<DailyRow<Partial<Record<AirMetric, Stat>>>[]> {
    const group: Record<string, unknown> = {
      _id: { $dateTrunc: { date: '$_id.h', unit: 'day', timezone: TIMEZONE } },
    };

    for (const metric of AIR_METRICS) {
      group[`${metric}_n`] = { $sum: `$m.${metric}.n` };
      group[`${metric}_s`] = { $sum: `$m.${metric}.s` };
      group[`${metric}_lo`] = { $min: `$m.${metric}.lo` };
      group[`${metric}_hi`] = { $max: `$m.${metric}.hi` };
    }

    const rows = await this.air
      .aggregate<Record<string, number> & { _id: Date }>([
        { $match: { _id: { $gte: { s: id, h: from }, $lt: { s: id, h: to } } } },
        { $group: group },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return rows.map((row) => {
      const value: Partial<Record<AirMetric, Stat>> = {};

      for (const metric of AIR_METRICS) {
        if (row[`${metric}_n`] > 0) {
          value[metric] = { n: row[`${metric}_n`], s: row[`${metric}_s`], lo: row[`${metric}_lo`], hi: row[`${metric}_hi`] };
        }
      }

      return { day: row._id, value };
    });
  }

  async parkingHours(id: number, from: Date, to: Date): Promise<number> {
    return this.parking.countDocuments({ _id: { $gte: { p: id, h: from }, $lt: { p: id, h: to } } });
  }

  async airHours(id: AirId, from: Date, to: Date): Promise<number> {
    return this.air.countDocuments({ _id: { $gte: { s: id, h: from }, $lt: { s: id, h: to } } });
  }

  async discoveredAir(): Promise<AirSource[]> {
    const rows = await this.devices.find({}, { sort: { device: 1 } }).toArray();

    return rows.map((r) => ({ id: r._id, provider: 'syngeos', device: r.device, name: r.name }));
  }

  async pollableAir(): Promise<AirSource[]> {
    const rows = await this.devices.find({ inCity: true }, { sort: { device: 1 } }).toArray();

    return rows.map((r) => ({ id: r._id, provider: 'syngeos', device: r.device, name: r.name }));
  }

  async saveDiscovery(found: AirSource[], at: Date): Promise<void> {
    for (const device of found) {
      await this.devices.updateOne(
        { _id: device.id },
        { $set: { device: device.device, name: device.name, inCity: true, seenAt: at }, $setOnInsert: { firstSeenAt: at } },
        { upsert: true },
      );
    }

    await this.devices.updateMany({ _id: { $nin: found.map((d) => d.id) }, inCity: true }, { $set: { inCity: false } });
  }

  async ping(): Promise<void> {
    await this.connection.db?.admin().ping();
  }

  private async upsertOnce<T extends { _id: unknown }>(
    collection: Collection<T>,
    { filter, update }: { filter: object; update: object },
  ): Promise<boolean> {
    try {
      await collection.updateOne(filter, update, { upsert: true });

      return true;
    } catch (error) {
      if (isDuplicate(error)) {
        return false;
      }

      throw error;
    }
  }

  private async bulkOnce<T extends { _id: unknown }>(
    collection: Collection<T>,
    ops: { filter: object; update: object }[],
  ): Promise<number> {
    if (ops.length === 0) {
      return 0;
    }

    const writes = ops.map(({ filter, update }) => ({
      updateOne: { filter, update, upsert: true },
    })) as unknown as AnyBulkWriteOperation<T>[];

    try {
      const result = await collection.bulkWrite(writes, { ordered: false });

      return result.modifiedCount + result.upsertedCount;
    } catch (error) {
      if (error instanceof MongoBulkWriteError) {
        const errors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];

        if (errors.every((e) => e.code === DUPLICATE_KEY)) {
          return error.result.modifiedCount + error.result.upsertedCount;
        }
      }

      throw error;
    }
  }

  private async setLatestAir(samples: AirSample[]): Promise<void> {
    const newest = new Map<string, AirSample>();

    for (const sample of samples) {
      const key = `${sample.deviceId}:${sample.metric}`;
      const seen = newest.get(key);

      if (!seen || sample.at > seen.at) {
        newest.set(key, sample);
      }
    }

    for (const sample of newest.values()) {
      const key = `m.${sample.metric}`;

      try {
        await this.latest<LatestAir>().updateOne(
          { _id: `air:${sample.deviceId}`, $or: [{ [`${key}.t`]: { $lt: sample.at } }, { [`${key}.t`]: { $exists: false } }] },
          { $set: { [`${key}.v`]: sample.value, [`${key}.t`]: sample.at } },
          { upsert: true },
        );
      } catch (error) {
        if (!isDuplicate(error)) {
          throw error;
        }
      }
    }
  }

  private async setLatest<T extends { _id: string; at: Date }>(id: string, at: Date, value: Omit<T, '_id' | 'at'>): Promise<void> {
    try {
      await this.latest<{ _id: string; at: Date }>().updateOne(
        { _id: id, $or: [{ at: { $lt: at } }, { at: { $exists: false } }] },
        { $set: { at, ...value } },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicate(error)) {
        throw error;
      }
    }
  }
}
