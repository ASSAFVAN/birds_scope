import { isPlatformBrowser } from '@angular/common';
import { Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import type { HistoricDate, RecentSearchEntry, SearchMode } from '../models/bird-search.model';

export const RECENT_SEARCHES_KEY = 'birdscope.recentSearches.v1';
export const MAX_RECENT_SEARCHES = 10;

/** Storage backend; null when unavailable (SSR, privacy mode, disabled storage). */
export const RECENT_SEARCH_STORAGE = new InjectionToken<Storage | null>('RECENT_SEARCH_STORAGE', {
  providedIn: 'root',
  factory: () => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;
    try {
      const storage = globalThis.localStorage;
      const probe = '__birdscope_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return null;
    }
  },
});

const sameDate = (a: HistoricDate | null, b: HistoricDate | null) =>
  a === b || (!!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day);

/** Two searches are duplicates when species, country, mode and (for history) date match. */
export function isSameSearch(a: RecentSearchEntry, b: RecentSearchEntry): boolean {
  return (
    a.mode === b.mode &&
    a.speciesCode === b.speciesCode &&
    a.countryCode === b.countryCode &&
    (a.mode === 'recent' || sameDate(a.date, b.date))
  );
}

function isValidEntry(value: unknown): value is RecentSearchEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  const mode = e['mode'];
  const date = e['date'] as Record<string, unknown> | null | undefined;
  const validDate =
    date === null ||
    (typeof date === 'object' && date !== undefined && ['year', 'month', 'day'].every((k) => Number.isInteger(date[k])));
  return (
    (mode === 'recent' || mode === 'history') &&
    (e['speciesCode'] === null || typeof e['speciesCode'] === 'string') &&
    typeof e['countryCode'] === 'string' &&
    typeof e['timestamp'] === 'number' &&
    validDate &&
    (mode === 'recent' || date !== null)
  );
}

/** Recent searches persisted in localStorage (criteria only, never result data). */
@Injectable({ providedIn: 'root' })
export class RecentSearchService {
  private readonly storage = inject(RECENT_SEARCH_STORAGE);
  private readonly state = signal<readonly RecentSearchEntry[]>(this.read());

  readonly entries = this.state.asReadonly();

  forMode(mode: SearchMode): RecentSearchEntry[] {
    return this.state().filter((e) => e.mode === mode);
  }

  add(entry: RecentSearchEntry): void {
    const next = [entry, ...this.state().filter((e) => !isSameSearch(e, entry))].slice(0, MAX_RECENT_SEARCHES);
    this.state.set(next);
    this.write(next);
  }

  /** Removes one saved search (matched like duplicates are: mode, species, country, date). */
  remove(entry: RecentSearchEntry): void {
    const next = this.state().filter((e) => !isSameSearch(e, entry));
    this.state.set(next);
    this.write(next);
  }

  clear(mode?: SearchMode): void {
    const next = mode ? this.state().filter((e) => e.mode !== mode) : [];
    this.state.set(next);
    this.write(next);
  }

  private read(): RecentSearchEntry[] {
    if (!this.storage) return [];
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      // Normalize: keep only well-formed entries, newest first, no duplicates.
      const valid = parsed.filter(isValidEntry).sort((a, b) => b.timestamp - a.timestamp);
      const unique: RecentSearchEntry[] = [];
      for (const entry of valid) {
        if (!unique.some((u) => isSameSearch(u, entry))) unique.push(entry);
      }
      return unique.slice(0, MAX_RECENT_SEARCHES);
    } catch {
      return [];
    }
  }

  private write(entries: readonly RecentSearchEntry[]): void {
    if (!this.storage) return;
    try {
      if (entries.length) this.storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries));
      else this.storage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Quota exceeded or storage disabled mid-session: keep the in-memory list.
    }
  }
}
