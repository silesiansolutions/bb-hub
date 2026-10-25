import type { Format } from './format';
import { METRIC_UNITS, type MetricKey } from './metrics';

const DIGITS: Partial<Record<MetricKey, number>> = { pressure: 0, caqi: 0 };

export const metricDigits = (metric: MetricKey) => DIGITS[metric] ?? 1;

export const formatMetric = (metric: MetricKey, value: number, format: Format) => {
  const unit = METRIC_UNITS[metric];
  const text = format.number(value, metricDigits(metric));

  return unit ? `${text} ${unit}` : text;
};
