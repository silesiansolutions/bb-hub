export const AIR_METRICS = [
  'temperature',
  'humidity',
  'pressure',
  'pm1',
  'pm25',
  'pm10',
  'ch2o',
  'no2',
  'o3',
  'co',
  'so2',
  'c6h6',
  'caqi',
] as const;

export type AirMetric = (typeof AIR_METRICS)[number];

export interface ParkingReading {
  parkingId: number;
  at: Date;
  available: number;
  capacity: number;
}

export interface AirReading {
  deviceId: number;
  at: Date;
  metrics: Partial<Record<AirMetric, number>>;
}

export interface Stat {
  n: number;
  s: number;
  lo: number;
  hi: number;
}

export interface ParkingHourly {
  _id: { p: number; h: Date };
  n: number;
  s: number;
  lo: number;
  hi: number;
  cap: number;
  last: Date;
}

export interface AirHourly {
  _id: { s: number; h: Date };
  n: number;
  m: Partial<Record<AirMetric, Stat>>;
  last: Date;
}

export const hourStart = (at: Date): Date => {
  const h = new Date(at.getTime());

  h.setUTCMinutes(0, 0, 0);

  return h;
};

const notCountedYet = (at: Date) => ({ $or: [{ last: { $lt: at } }, { last: { $exists: false } }] });

export const parkingUpsert = (r: ParkingReading) => ({
  filter: { _id: { p: r.parkingId, h: hourStart(r.at) }, ...notCountedYet(r.at) },
  update: {
    $inc: { n: 1, s: r.available },
    $min: { lo: r.available },
    $max: { hi: r.available },
    $set: { cap: r.capacity, last: r.at },
  },
});

export const airUpsert = (r: AirReading) => {
  const inc: Record<string, number> = { n: 1 };
  const min: Record<string, number> = {};
  const max: Record<string, number> = {};

  for (const [metric, value] of Object.entries(r.metrics)) {
    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }

    inc[`m.${metric}.n`] = 1;
    inc[`m.${metric}.s`] = value;
    min[`m.${metric}.lo`] = value;
    max[`m.${metric}.hi`] = value;
  }

  return {
    filter: { _id: { s: r.deviceId, h: hourStart(r.at) }, ...notCountedYet(r.at) },
    update: { $inc: inc, $min: min, $max: max, $set: { last: r.at } },
  };
};

export const statView = (stat: Stat) => ({
  avg: Math.round((stat.s / stat.n) * 100) / 100,
  min: stat.lo,
  max: stat.hi,
  samples: stat.n,
});
