import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCurrent, newestAt, readingIsCurrent, sortSensors } from './air.ts';
import { isStale } from './stale.ts';
import type { AirSensor } from './types';

const now = Date.parse('2026-10-25T12:00:00Z');

const sensor = (id: number, metrics: Record<string, string>): AirSensor =>
  ({
    id,
    provider: 'syngeos',
    device: id,
    name: `s${id}`,
    latest: Object.keys(metrics).length
      ? {
          at: Object.values(metrics).sort().at(-1)!,
          metrics: Object.fromEntries(Object.entries(metrics).map(([k, at]) => [k, { value: 1, at }])),
        }
      : null,
  }) as unknown as AirSensor;

test('a reading is stale only when older than three hours', () => {
  assert.equal(isStale('2026-10-25T09:00:00Z', now), false);
  assert.equal(isStale('2026-10-25T08:59:59Z', now), true);
  assert.equal(isStale(null, now), true);
});

test('a fresh metric does not make an old one current', () => {
  const mixed = sensor(1, { temperature: '2026-10-25T11:50:00Z', pm10: '2025-06-30T20:00:00Z' });

  assert.equal(isCurrent(mixed, now), true);
  assert.equal(readingIsCurrent(mixed.latest!.metrics.temperature, now), true);
  assert.equal(readingIsCurrent(mixed.latest!.metrics.pm10, now), false);
  assert.equal(readingIsCurrent(undefined, now), false);
});

test('current sensors come first, sensors without data are hidden, newest time is found', () => {
  const old = sensor(1, { pm10: '2025-09-21T19:00:00Z' });
  const fresh = sensor(2, { pm10: '2026-10-25T11:00:00Z' });
  const empty = sensor(3, {});

  assert.deepEqual(sortSensors([old, empty, fresh], now).map((s) => s.id), [2, 1]);
  assert.equal(newestAt([old, empty, fresh]), '2026-10-25T11:00:00Z');
  assert.equal(newestAt([empty]), null);
});
