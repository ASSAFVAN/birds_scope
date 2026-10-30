import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecentSearchEntry } from '../models/bird-search.model';
import { MAX_RECENT_SEARCHES, RECENT_SEARCHES_KEY, RECENT_SEARCH_STORAGE, RecentSearchService } from './recent-search.service';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const entry = (overrides: Partial<RecentSearchEntry> = {}): RecentSearchEntry => ({
  mode: 'recent',
  speciesCode: 'houspa',
  commonName: 'House Sparrow',
  scientificName: 'Passer domesticus',
  countryCode: 'IL',
  date: null,
  timestamp: 1,
  ...overrides,
});

function create(storage: Storage | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: RECENT_SEARCH_STORAGE, useValue: storage }],
  });
  return TestBed.inject(RecentSearchService);
}

describe('RecentSearchService', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('saves searches newest-first and persists them', () => {
    const service = create(storage);
    service.add(entry({ speciesCode: 'a', timestamp: 1 }));
    service.add(entry({ speciesCode: 'b', timestamp: 2 }));
    expect(service.entries().map((e) => e.speciesCode)).toEqual(['b', 'a']);

    const reloaded = create(storage);
    expect(reloaded.entries().map((e) => e.speciesCode)).toEqual(['b', 'a']);
  });

  it('deduplicates by species, country, mode and historic date', () => {
    const service = create(storage);
    service.add(entry({ timestamp: 1 }));
    service.add(entry({ timestamp: 2 })); // duplicate → moves to top
    service.add(entry({ countryCode: 'JP', timestamp: 3 }));
    service.add(entry({ mode: 'history', date: { year: 2025, month: 11, day: 15 }, timestamp: 4 }));
    service.add(entry({ mode: 'history', date: { year: 2025, month: 11, day: 16 }, timestamp: 5 }));
    service.add(entry({ mode: 'history', date: { year: 2025, month: 11, day: 15 }, timestamp: 6 }));

    const keys = service.entries().map((e) => `${e.mode}:${e.countryCode}:${e.date?.day ?? '-'}:${e.timestamp}`);
    expect(keys).toEqual(['history:IL:15:6', 'history:IL:16:5', 'recent:JP:-:3', 'recent:IL:-:2']);
  });

  it(`keeps only the ${MAX_RECENT_SEARCHES} most recent`, () => {
    const service = create(storage);
    for (let i = 0; i < 15; i++) service.add(entry({ speciesCode: `sp${i}`, timestamp: i }));
    expect(service.entries()).toHaveLength(MAX_RECENT_SEARCHES);
    expect(service.entries()[0]!.speciesCode).toBe('sp14');
  });

  it('clears all entries, or only one section', () => {
    const service = create(storage);
    service.add(entry({ timestamp: 1 }));
    service.add(entry({ mode: 'history', date: { year: 2025, month: 1, day: 1 }, timestamp: 2 }));
    service.clear('history');
    expect(service.entries().map((e) => e.mode)).toEqual(['recent']);
    service.clear();
    expect(service.entries()).toEqual([]);
    expect(storage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });

  it('removes a single entry and persists the rest', () => {
    const service = create(storage);
    service.add(entry({ speciesCode: 'houspa', timestamp: 1 }));
    service.add(entry({ speciesCode: 'comkin1', commonName: 'Common Kingfisher', timestamp: 2 }));
    service.add(entry({ mode: 'history', date: { year: 2025, month: 1, day: 1 }, timestamp: 3 }));
    service.remove(entry({ speciesCode: 'comkin1', timestamp: 2 }));
    expect(service.entries().map((e) => `${e.mode}:${e.speciesCode}`)).toEqual(['history:houspa', 'recent:houspa']);
    expect(create(storage).entries()).toHaveLength(2);
  });

  it('removing a history search keeps the same species on other dates', () => {
    const service = create(storage);
    const jan1 = entry({ mode: 'history', date: { year: 2025, month: 1, day: 1 }, timestamp: 1 });
    service.add(jan1);
    service.add(entry({ mode: 'history', date: { year: 2025, month: 1, day: 2 }, timestamp: 2 }));
    service.remove(jan1);
    expect(service.entries().map((e) => e.date?.day)).toEqual([2]);
  });

  it('ignores malformed storage content', () => {
    storage.setItem(RECENT_SEARCHES_KEY, '{not json');
    expect(create(storage).entries()).toEqual([]);

    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([{ foo: 1 }, entry({ timestamp: 5 }), 'x', null]));
    expect(create(storage).entries()).toHaveLength(1);
  });

  it('works without storage (SSR / disabled)', () => {
    const service = create(null);
    service.add(entry());
    expect(service.entries()).toHaveLength(1);
  });

  it('keeps working when storage throws', () => {
    const broken = new MemoryStorage();
    broken.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    const service = create(broken);
    expect(() => service.add(entry())).not.toThrow();
    expect(service.entries()).toHaveLength(1);
  });

  it('never stores observation data', () => {
    const service = create(storage);
    service.add(entry());
    const raw = JSON.parse(storage.getItem(RECENT_SEARCHES_KEY)!)[0];
    expect(Object.keys(raw).sort()).toEqual(
      ['commonName', 'countryCode', 'date', 'mode', 'scientificName', 'speciesCode', 'timestamp'].sort(),
    );
  });
});
