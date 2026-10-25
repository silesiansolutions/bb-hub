import airDevices from './air-devices.json';
import parkings from './parkings.json';

export interface ParkingSource {
  id: number;
  provider: 'controlla';
  name: string;
  street: string;
  url: string;
}

export interface AirSource {
  id: number;
  provider: 'syngeos';
  device: number;
  name: string;
}

export const PARKINGS = parkings as ParkingSource[];
export const AIR_DEVICES = airDevices as AirSource[];

export const findParking = (id: number): ParkingSource | undefined => PARKINGS.find((p) => p.id === id);
export const findAirDevice = (id: number): AirSource | undefined => AIR_DEVICES.find((a) => a.id === id);
