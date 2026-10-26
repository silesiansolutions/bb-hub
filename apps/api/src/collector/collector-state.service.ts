import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Collection } from 'mongodb';
import { Connection } from 'mongoose';

export const SOURCES = ['parking', 'air', 'discovery', 'export'] as const;

export type Source = (typeof SOURCES)[number];

interface SourceState {
  _id: Source;
  lastSuccess?: Date;
  lastFailure?: Date;
  detail?: Record<string, number | string>;
}

export interface SourceView {
  lastSuccess: Date | null;
  lastFailure: Date | null;
  detail: Record<string, number | string> | null;
}

@Injectable()
export class CollectorStateService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get states(): Collection<SourceState> {
    return this.connection.collection<SourceState>('collector_state') as unknown as Collection<SourceState>;
  }

  async success(source: Source, at: Date, detail: Record<string, number | string>): Promise<void> {
    await this.states.updateOne({ _id: source }, { $set: { lastSuccess: at, detail } }, { upsert: true });
  }

  async failure(source: Source, at: Date): Promise<void> {
    await this.states.updateOne({ _id: source }, { $set: { lastFailure: at } }, { upsert: true });
  }

  async lastSuccess(source: Source): Promise<Date | undefined> {
    return (await this.states.findOne({ _id: source }))?.lastSuccess;
  }

  async exportedThrough(): Promise<string | undefined> {
    const through = (await this.states.findOne({ _id: 'export' }))?.detail?.through;

    return typeof through === 'string' ? through : undefined;
  }

  async view(): Promise<Record<Source, SourceView>> {
    const rows = await this.states.find({}).toArray();

    return Object.fromEntries(
      SOURCES.map((source) => {
        const row = rows.find((r) => r._id === source);

        return [source, { lastSuccess: row?.lastSuccess ?? null, lastFailure: row?.lastFailure ?? null, detail: row?.detail ?? null }];
      }),
    ) as Record<Source, SourceView>;
  }
}
