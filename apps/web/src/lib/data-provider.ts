import type { BaseRecord, DataProvider, GetListParams, GetOneParams, HttpError } from '@refinedev/core';

import { API_URL } from './config';

type Query = Record<string, string | number | undefined>;

const buildUrl = (path: string, query?: Query): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }

  const qs = params.toString();

  return `${API_URL}/${path}${qs ? `?${qs}` : ''}`;
};

const get = async <T>(path: string, query?: Query): Promise<T> => {
  const response = await fetch(buildUrl(path, query), { headers: { Accept: 'application/json' } });

  if (!response.ok) {
    const error: HttpError = { message: response.statusText || `HTTP ${response.status}`, statusCode: response.status };
    throw error;
  }

  return (await response.json()) as T;
};

const readOnly = () => Promise.reject(new Error('read-only data provider'));

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,
  getList: async <TData extends BaseRecord>({ resource, meta }: GetListParams) => {
    const rows = await get<TData[]>(resource, meta?.query as Query | undefined);

    return { data: rows, total: rows.length };
  },
  getOne: async <TData extends BaseRecord>({ resource, id, meta }: GetOneParams) => ({
    data: await get<TData>(`${resource}/${id}`, meta?.query as Query | undefined),
  }),
  create: readOnly,
  update: readOnly,
  deleteOne: readOnly,
};
