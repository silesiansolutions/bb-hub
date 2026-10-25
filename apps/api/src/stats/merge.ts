import { AirMetric, Stat } from '../aggregates/hourly';

export type MetricStats = Partial<Record<AirMetric, Stat>>;

export interface CityDay {
  day: Date;
  metrics: Partial<Record<AirMetric, Stat & { sensors: number }>>;
}

export const mergeCityDays = (perSensor: { day: Date; value: MetricStats }[][]): CityDay[] => {
  const days = new Map<number, CityDay>();

  for (const rows of perSensor) {
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
  }

  return [...days.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
};

export const share = (hours: number, from: Date, to: Date): number => {
  const total = Math.ceil((to.getTime() - from.getTime()) / 3_600_000);

  return total > 0 ? Math.round((hours / total) * 1000) / 10 : 0;
};
