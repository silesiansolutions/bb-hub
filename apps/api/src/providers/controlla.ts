export interface ControllaReading {
  available: number;
  capacity: number;
}

export const parseControlla = (body: unknown): ControllaReading | undefined => {
  if (typeof body !== 'string') {
    return undefined;
  }

  const available = body.match(/Wolne miejsca:\s*(\d+)/);
  const capacity = body.match(/Pojemno\S*\s+parkingu:\s*(\d+)/);

  if (!available || !capacity) {
    return undefined;
  }

  return { available: Number(available[1]), capacity: Number(capacity[1]) };
};
