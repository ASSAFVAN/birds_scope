import { ApiError } from './api-error.js';

/** Country (IL), subnational1 (US-NY) or subnational2 (US-NY-109) region codes. */
const REGION_CODE = /^[A-Z]{2}(?:-[A-Z0-9]{1,3}){0,2}$/;
/** eBird species codes are short lowercase alphanumerics, e.g. "houspa", "y00478", "eurbla1". */
const SPECIES_CODE = /^[a-z0-9]{3,12}$/;

/** eBird historic data starts in 1800. */
export const MIN_HISTORIC_YEAR = 1800;

export function parseRegionCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!REGION_CODE.test(code)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid region code. Use an eBird code such as "IL" or "US".');
  }
  return code;
}

export function parseSpeciesCode(value: unknown, required: true): string;
export function parseSpeciesCode(value: unknown, required: false): string | undefined;
export function parseSpeciesCode(value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === '') {
    if (required) throw new ApiError(400, 'INVALID_REQUEST', 'A species code is required.');
    return undefined;
  }
  const code = typeof value === 'string' ? value.trim() : '';
  if (!SPECIES_CODE.test(code)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid eBird species code.');
  }
  return code;
}

export interface HistoricDate {
  year: number;
  month: number;
  day: number;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this month (handles leap years).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Validates a historic date and rejects dates in the future. "Today" is taken
 * in UTC+14 (the earliest time zone) so a user whose local date is ahead of
 * the server's is never wrongly rejected.
 */
export function parseHistoricDate(
  y: unknown,
  m: unknown,
  d: unknown,
  now: Date = new Date(),
): HistoricDate {
  const parse = (v: unknown) => (typeof v === 'string' && /^\d{1,4}$/.test(v) ? Number(v) : NaN);
  const year = parse(y);
  const month = parse(m);
  const day = parse(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Year, month and day are required.');
  }
  if (year < MIN_HISTORIC_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'That date does not exist.');
  }
  const latestToday = new Date(now.getTime() + 14 * 3_600_000);
  const requested = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(latestToday.getUTCFullYear(), latestToday.getUTCMonth(), latestToday.getUTCDate());
  if (requested > todayUtc) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Historic searches cannot use a future date.');
  }
  return { year, month, day };
}
