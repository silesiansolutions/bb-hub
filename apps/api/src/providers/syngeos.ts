import { AirMetric } from '../aggregates/hourly';

const SENSOR_TO_METRIC: Record<string, AirMetric> = {
  temperature: 'temperature',
  humidity: 'humidity',
  air_pressure: 'pressure',
  pressure: 'pressure',
  pm1: 'pm1',
  pm2_5: 'pm25',
  pm25: 'pm25',
  pm10: 'pm10',
  ch2o: 'ch2o',
  no2: 'no2',
  o3: 'o3',
  co: 'co',
  so2: 'so2',
  c6h6: 'c6h6',
  caqi: 'caqi',
};

interface SyngeosSensor {
  name?: string;
  data?: { read_at?: string; value?: unknown }[];
}

interface SyngeosDevice {
  city?: string;
  address?: string;
  sensors?: SyngeosSensor[];
}

export interface SyngeosMetricValue {
  metric: AirMetric;
  at?: Date;
  value: number;
}

export interface SyngeosReading {
  city?: string;
  address?: string;
  values: SyngeosMetricValue[];
}

const parseDate = (raw: string | undefined): Date | undefined => {
  if (!raw) {
    return undefined;
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const parseSyngeos = (body: unknown): SyngeosReading | undefined => {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const device = body as SyngeosDevice;
  const values: SyngeosMetricValue[] = [];

  for (const sensor of device.sensors ?? []) {
    const metric = sensor.name ? SENSOR_TO_METRIC[sensor.name.toLowerCase()] : undefined;
    const latest = sensor.data?.[0];
    const value = typeof latest?.value === 'string' ? Number(latest.value) : latest?.value;

    if (!metric || typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    values.push({ metric, at: parseDate(latest?.read_at), value });
  }

  return { city: device.city, address: device.address, values };
};

const foldCity = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .trim();

export const isInCity = (reading: SyngeosReading, city: string): boolean =>
  foldCity(reading.city ?? '').includes(foldCity(city));
