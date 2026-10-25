import { AirMetric, Stat } from '../aggregates/hourly';

export type MetricStats = Partial<Record<AirMetric, Stat>>;

export interface CityDay {
  day: Date;
  metrics: Partial<Record<AirMetric, Stat & { sensors: number }>>;
}

export const addSensorDays = (days: Map<number, CityDay>, rows: { day: Date; value: MetricStats }[]): Map<number, CityDay> => {
  for (const { day, value } of rows) {
    const entry = days.get(day.getTime()) ?? { day, metrics: {} };

    for (const [metric, stat] of Object.entries(value) as [AirMetric, Stat][]) {
      const seen = entry.metrics[metric];

      entry.metrics[metric] = seen
        ? { n: seen.n + stat.n, s: seen.s + stat.s, lo: Math.min(seen.lo, stat.lo), hi: Math.max(seen.hi, stat.hi), sensors: seen.sensors + 1 }
        : { ...stat, sensors: 1 };
    }

    days.set(day.getTime(), entry);
  }

  return days;
};

export const sortedCityDays = (days: Map<number, CityDay>): CityDay[] => [...days.values()].sort((a, b) => a.day.getTime() - b.day.getTime());

export const mergeCityDays = (perSensor: { day: Date; value: MetricStats }[][]): CityDay[] =>
  sortedCityDays(perSensor.reduce((days, rows) => addSensorDays(days, rows), new Map<number, CityDay>()));

const HOUR = 3_600_000;

export const share = (hours: number, from: Date, to: Date, now = new Date()): number => {
  const end = Math.min(to.getTime(), Math.ceil(now.getTime() / HOUR) * HOUR);
  const total = Math.ceil((end - from.getTime()) / HOUR);

  return total > 0 ? Math.min(100, Math.round((hours / total) * 1000) / 10) : 0;
};
