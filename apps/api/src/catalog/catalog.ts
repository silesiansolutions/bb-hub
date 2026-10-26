import airDevices from './air-devices.json';
import parkings from './parkings.json';

export type AirId = number | `d${number}`;

export interface ParkingSource {
  id: number;
  provider: 'controlla';
  name: string;
  street: string;
  url: string;
}

export interface AirSource {
  id: AirId;
  provider: 'syngeos';
  device: number;
  name: string;
}

export const PARKINGS = parkings as ParkingSource[];
export const AIR_DEVICES = airDevices as AirSource[];

export const findParking = (id: number): ParkingSource | undefined => PARKINGS.find((p) => p.id === id);

export const parseAirId = (raw: string): AirId | undefined => {
  if (/^[1-9]\d*$/.test(raw)) {
    return Number(raw);
  }

  return /^d[1-9]\d*$/.test(raw) ? (raw as `d${number}`) : undefined;
};

export const airIdForDevice = (device: number): AirId => AIR_DEVICES.find((a) => a.device === device)?.id ?? `d${device}`;

export const mergeAirDevices = (discovered: AirSource[]): AirSource[] => [
  ...AIR_DEVICES,
  ...discovered.filter((d) => typeof d.id === 'string').sort((a, b) => a.device - b.device),
];
