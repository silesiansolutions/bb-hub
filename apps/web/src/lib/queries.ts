'use client';

import { useList, useOne, type BaseRecord } from '@refinedev/core';

import { REFRESH_MS } from './config';
import type { AirDaily, AirHourly, AirSensor, Parking, ParkingDaily, ParkingHourly } from './types';

export type Rows<T> = { rows: T[]; loading: boolean; failed: boolean; refetch: () => void };
export type Row<T> = { row: T | undefined; loading: boolean; failed: boolean; missing: boolean; refetch: () => void };
export type Range = { from: string; to: string };

const options = { retry: (count: number, error: { statusCode?: number }) => error.statusCode !== 404 && count < 1, refetchInterval: REFRESH_MS, refetchOnWindowFocus: false };

const useRows = <T extends BaseRecord>(resource: string, query?: Record<string, string>, enabled = true): Rows<T> => {
  const { query: q, result } = useList<T>({
    resource,
    pagination: { mode: 'off' },
    meta: { query },
    queryOptions: { ...options, enabled },
  });

  return { rows: result.data, loading: q.isLoading, failed: q.isError, refetch: () => void q.refetch() };
};

const useRow = <T extends BaseRecord>(resource: string, id: number): Row<T> => {
  const { query: q, result } = useOne<T>({
    resource,
    id,
    queryOptions: { ...options, enabled: Number.isInteger(id) },
  });

  return {
    row: result,
    loading: q.isLoading,
    failed: q.isError,
    missing: q.error?.statusCode === 404,
    refetch: () => void q.refetch(),
  };
};

export const useParkings = () => useRows<Parking>('parkings');
export const useParking = (id: number) => useRow<Parking>('parkings', id);
export const useParkingHourly = (id: number, range: Range) => useRows<ParkingHourly>(`parkings/${id}/hourly`, range, Number.isInteger(id));
export const useParkingDaily = (id: number, range: Range) => useRows<ParkingDaily>(`parkings/${id}/daily`, range, Number.isInteger(id));

export const useAirSensors = () => useRows<AirSensor>('air');
export const useAirSensor = (id: number) => useRow<AirSensor>('air', id);
export const useAirHourly = (id: number, range: Range) => useRows<AirHourly>(`air/${id}/hourly`, range, Number.isInteger(id));
export const useAirDaily = (id: number, range: Range) => useRows<AirDaily>(`air/${id}/daily`, range, Number.isInteger(id));
