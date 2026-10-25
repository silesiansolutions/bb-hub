import assert from 'node:assert/strict';
import { test } from 'node:test';

import { caqiLevel } from './metrics.ts';

test('CAQI levels follow the Syngeos norm, lower bound inclusive', () => {
  assert.equal(caqiLevel(0), 'veryGood');
  assert.equal(caqiLevel(24.99), 'veryGood');
  assert.equal(caqiLevel(25), 'good');
  assert.equal(caqiLevel(50), 'medium');
  assert.equal(caqiLevel(75), 'sufficient');
  assert.equal(caqiLevel(99.9), 'sufficient');
  assert.equal(caqiLevel(100), 'bad');
});
