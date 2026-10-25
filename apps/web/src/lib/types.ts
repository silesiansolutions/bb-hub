import type { MetricKey } from './metrics';

export type Stat = { avg: number; min: number; max: number; samples: number };

export type ParkingLatest = { at: string; available: number; capacity: number };

export type Parking = {
  id: number;
  provider: string;
  name: string;
  street: string;
  latest: ParkingLatest | null;
};

export type ParkingHourly = { hour: string; capacity: number; available: Stat };
export type ParkingDaily = { day: string; capacity: number; available: Stat };

export type AirReading = { value: number; at: string };

export type AirSensor = {
  id: number;
  provider: string;
  device: number;
  name: string;
  latest: { at: string; metrics: Partial<Record<MetricKey, AirReading>> } | null;
};

export type AirHourly = { hour: string; metrics: Partial<Record<MetricKey, Stat>> };
export type AirDaily = { day: string; metrics: Partial<Record<MetricKey, Stat>> };
