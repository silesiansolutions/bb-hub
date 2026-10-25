import { Module } from '@nestjs/common';

import { AggregatesService } from './aggregates.service';

@Module({
  providers: [AggregatesService],
  exports: [AggregatesService],
})
export class AggregatesModule {}
