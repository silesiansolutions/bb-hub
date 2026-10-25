import { isStale } from './stale.ts';
import type { AirSensor } from './types';

export const readingIsCurrent = (reading: { at: string } | undefined, now: number): boolean =>
  reading !== undefined && !isStale(reading.at, now);

export const hasData = (sensor: AirSensor) => sensor.latest !== null;

export const isCurrent = (sensor: AirSensor, now: number) => sensor.latest !== null && !isStale(sensor.latest.at, now);

export const newestAt = (sensors: AirSensor[]): string | null =>
  sensors.reduce<string | null>((max, s) => (s.latest && (!max || s.latest.at > max) ? s.latest.at : max), null);

export const sortSensors = (sensors: AirSensor[], now: number): AirSensor[] =>
  sensors
    .filter(hasData)
    .toSorted((a, b) => Number(isCurrent(b, now)) - Number(isCurrent(a, now)) || (b.latest?.at ?? '').localeCompare(a.latest?.at ?? ''));
