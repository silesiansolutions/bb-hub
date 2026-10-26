import { AwsClient } from 'aws4fetch';

import { DayFile } from './day-files';

export interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2Store {
  private readonly client: AwsClient;

  constructor(private readonly config: R2Config) {
    this.client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: 's3', region: 'auto' });
  }

  async put(file: DayFile): Promise<void> {
    const url = `${this.config.endpoint.replace(/\/+$/, '')}/${this.config.bucket}/${file.path}`;
    const res = await this.client.fetch(url, {
      method: 'PUT',
      body: file.text,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`R2 put ${file.path} answered ${res.status}`);
    }
  }
}
