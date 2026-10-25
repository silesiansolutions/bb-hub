export const METRICS = [
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

export type MetricKey = (typeof METRICS)[number];

export const METRIC_UNITS: Record<MetricKey, string> = {
  temperature: '°C',
  humidity: '%',
  pressure: 'hPa',
  pm1: 'µg/m³',
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  ch2o: 'µg/m³',
  no2: 'µg/m³',
  o3: 'µg/m³',
  co: 'mg/m³',
  so2: 'µg/m³',
  c6h6: 'µg/m³',
  caqi: '',
};

export type CaqiLevel = 'veryGood' | 'good' | 'medium' | 'sufficient' | 'bad';

export const caqiLevel = (value: number): CaqiLevel => {
  if (value <= 25) return 'veryGood';
  if (value <= 50) return 'good';
  if (value <= 75) return 'medium';
  if (value <= 100) return 'sufficient';
  return 'bad';
};

export const CAQI_COLORS: Record<CaqiLevel, string> = {
  veryGood: 'green',
  good: 'lime',
  medium: 'gold',
  sufficient: 'orange',
  bad: 'red',
};
