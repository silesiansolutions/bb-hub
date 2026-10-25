export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '/api').replace(/\/+$/, '');
export const TIME_ZONE = 'Europe/Warsaw';
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const STALE_AFTER_MS = 3 * HOUR_MS;
export const REFRESH_MS = 5 * 60_000;
export const HOURLY_MAX_DAYS = 31;
export const DAILY_MAX_DAYS = 400;
