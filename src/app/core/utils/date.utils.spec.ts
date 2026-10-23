import { describe, expect, it } from 'vitest';
import { daysInMonth, isLeapYear, toHistoricDate, validateHistoricDate, yesterday } from './date.utils';

const TODAY = new Date(2026, 9, 22); // 22 Oct 2026, local time

describe('date utils', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it('accepts a real past date and today', () => {
    expect(validateHistoricDate({ year: 2025, month: 11, day: 15 }, TODAY)).toBeNull();
    expect(validateHistoricDate({ year: 2024, month: 2, day: 29 }, TODAY)).toBeNull();
    expect(validateHistoricDate({ year: 2026, month: 10, day: 22 }, TODAY)).toBeNull();
  });

  it('requires year, month and day', () => {
    expect(validateHistoricDate({ year: 2025, month: null, day: 1 }, TODAY)).toBe('required');
    expect(validateHistoricDate({ year: null, month: 1, day: 1 }, TODAY)).toBe('required');
    expect(validateHistoricDate({ year: 2025, month: 1, day: null }, TODAY)).toBe('required');
  });

  it.each([
    [2025, 2, 29],
    [2023, 2, 29],
    [2025, 2, 30],
    [2025, 4, 31],
    [2025, 6, 31],
    [2025, 9, 31],
    [2025, 11, 31],
    [2025, 13, 1],
    [2025, 0, 10],
    [2025, 1, 0],
  ])('rejects non-existent date %i-%i-%i', (year, month, day) => {
    expect(validateHistoricDate({ year, month, day }, TODAY)).toBe('invalid');
  });

  it('rejects future dates', () => {
    expect(validateHistoricDate({ year: 2026, month: 10, day: 23 }, TODAY)).toBe('future');
    expect(validateHistoricDate({ year: 2027, month: 1, day: 1 }, TODAY)).toBe('future');
  });

  it('rejects years before eBird data', () => {
    expect(validateHistoricDate({ year: 1799, month: 1, day: 1 }, TODAY)).toBe('too-early');
  });

  it('converts only valid values', () => {
    expect(toHistoricDate({ year: 2025, month: 11, day: 15 }, TODAY)).toEqual({ year: 2025, month: 11, day: 15 });
    expect(toHistoricDate({ year: 2025, month: 2, day: 30 }, TODAY)).toBeNull();
  });

  it('defaults to yesterday across month boundaries', () => {
    expect(yesterday(new Date(2026, 2, 1))).toEqual({ year: 2026, month: 2, day: 28 });
  });
});
