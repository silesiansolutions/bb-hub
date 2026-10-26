import { BufferEntry, ParkingLine, RawLine } from './buffer';

export const FIRST_WRITABLE_DAY = '2025-06-14';

export interface DayFile {
  path: string;
  text: string;
}

const record = (entry: BufferEntry, line: ParkingLine | RawLine) =>
  entry.type === 'parking'
    ? { id: entry.id, date: line.date, availableSpots: (line as ParkingLine).availableSpots, totalSpots: (line as ParkingLine).totalSpots }
    : { id: entry.id, date: line.date, originalData: JSON.parse((line as RawLine).raw) as unknown };

export const buildDayFiles = (day: string, entries: BufferEntry[]): DayFile[] => {
  if (day < FIRST_WRITABLE_DAY) {
    throw new Error(`refusing to write ${day}: days up to 2025-06-13 are frozen`);
  }

  return entries.flatMap((entry) => {
    const records = entry.lines
      .filter((line) => line.date.slice(0, 10) === day)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((line) => record(entry, line));

    return records.length === 0 ? [] : [{ path: `data/${entry.type}/${entry.id}/${day}.json`, text: JSON.stringify(records, null, 2) }];
  });
};
