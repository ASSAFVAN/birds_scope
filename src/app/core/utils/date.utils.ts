import type { HistoricDate, HistoricDateValue } from '../models/bird-search.model';

export const MIN_HISTORIC_YEAR = 1800;

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Number of days in a month (1-12), accounting for leap years. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export type DateValidationError = 'required' | 'invalid' | 'future' | 'too-early';

export const DATE_ERROR_MESSAGES: Record<DateValidationError, string> = {
  required: 'Choose a year, month and day.',
  invalid: 'That date does not exist. Check the day for the selected month.',
  future: 'The date cannot be in the future.',
  'too-early': `eBird historic data starts in ${MIN_HISTORIC_YEAR}.`,
};

/** Returns null when the date is complete, real and not after `today` (local calendar date). */
export function validateHistoricDate(value: HistoricDateValue, today: Date): DateValidationError | null {
  const { year, month, day } = value;
  if (year === null || month === null || day === null) return 'required';
  if (![year, month, day].every(Number.isInteger)) return 'invalid';
  if (year < MIN_HISTORIC_YEAR) return 'too-early';
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return 'invalid';
  const requested = year * 10_000 + month * 100 + day;
  const current = today.getFullYear() * 10_000 + (today.getMonth() + 1) * 100 + today.getDate();
  return requested > current ? 'future' : null;
}

export function toHistoricDate(value: HistoricDateValue, today: Date): HistoricDate | null {
  return validateHistoricDate(value, today) === null
    ? { year: value.year!, month: value.month!, day: value.day! }
    : null;
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const formatHistoricDate = (d: HistoricDate): string => `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;

/** Yesterday in local time — a sensible default for a historic search. */
export function yesterday(today: Date): HistoricDate {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}
