import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUSE_SPARROW, SPANISH_SPARROW, deferred, makeObservation, makeResponse } from '../../../testing/fixtures';
import type { SearchMode } from '../models/bird-search.model';
import type { ObservationsResponse } from '../models/observation.model';
import { EbirdApiService } from '../services/ebird-api.service';
import { HistoricalObservationService } from '../services/historical-observation.service';
import { RECENT_SEARCH_STORAGE, RecentSearchService } from '../services/recent-search.service';
import { NOW } from '../utils/clock';
import { ObservationSearchStore, SEARCH_MODE } from './observation-search.store';

const TODAY = new Date(2026, 9, 22, 12);

function setup(mode: SearchMode) {
  const api = { getRecentObservations: vi.fn(), getHistoricObservations: vi.fn() };
  const historical = { getForDate: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: EbirdApiService, useValue: api },
      { provide: HistoricalObservationService, useValue: historical },
      { provide: RECENT_SEARCH_STORAGE, useValue: null },
      { provide: NOW, useValue: () => TODAY },
      { provide: SEARCH_MODE, useValue: mode },
      ObservationSearchStore,
    ],
  });
  return {
    store: TestBed.inject(ObservationSearchStore),
    recent: TestBed.inject(RecentSearchService),
    api,
    historical,
  };
}

describe('ObservationSearchStore', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('requires a species unless "all species" is on (recent mode)', async () => {
    const { store, api } = setup('recent');
    await store.search();
    expect(api.getRecentObservations).not.toHaveBeenCalled();
    expect(store.speciesError()).toBeTruthy();

    api.getRecentObservations.mockResolvedValue(makeResponse([]));
    store.allSpecies.set(true);
    await store.search();
    expect(api.getRecentObservations).toHaveBeenCalledWith('IL', null);
  });

  it('sets loading, then results, and records the recent search', async () => {
    const { store, api, recent } = setup('recent');
    const pending = deferred<ObservationsResponse>();
    api.getRecentObservations.mockReturnValue(pending.promise);
    store.species.set(HOUSE_SPARROW);

    const run = store.search();
    expect(store.loading()).toBe(true);
    expect(store.error()).toBeNull();

    pending.resolve(makeResponse([makeObservation({ id: 'a' }), makeObservation({ id: 'b', latitude: null })]));
    await run;

    expect(store.status()).toBe('success');
    expect(store.loading()).toBe(false);
    expect(store.count()).toBe(2);
    expect(store.unmappableCount()).toBe(1);
    expect(api.getRecentObservations).toHaveBeenCalledWith('IL', 'houspa');
    expect(recent.entries()[0]).toMatchObject({ mode: 'recent', speciesCode: 'houspa', countryCode: 'IL' });
  });

  it('updates loading and error signals when the API fails', async () => {
    const { store, api } = setup('recent');
    store.species.set(HOUSE_SPARROW);
    store.observations.set([makeObservation()]);
    api.getRecentObservations.mockRejectedValue(
      new HttpErrorResponse({
        status: 429,
        error: { error: { code: 'RATE_LIMITED', message: 'Slow down' } },
      }),
    );

    await store.search();

    expect(store.loading()).toBe(false);
    expect(store.status()).toBe('error');
    expect(store.error()).toEqual({ code: 'RATE_LIMITED', message: 'Slow down', retryable: true });
    expect(store.observations()).toEqual([]);
  });

  it('maps a dropped connection to a network error', async () => {
    const { store, api } = setup('recent');
    store.species.set(HOUSE_SPARROW);
    api.getRecentObservations.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    await store.search();
    expect(store.error()?.code).toBe('NETWORK_ERROR');
  });

  it('never lets a stale response overwrite a newer one', async () => {
    const { store, api } = setup('recent');
    const slow = deferred<ObservationsResponse>();
    const fast = deferred<ObservationsResponse>();
    api.getRecentObservations.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    store.species.set(HOUSE_SPARROW);
    const first = store.search();
    store.species.set(SPANISH_SPARROW);
    const second = store.search();

    fast.resolve(makeResponse([makeObservation({ id: 'new', speciesCode: 'spaspa1' })]));
    await second;
    slow.resolve(makeResponse([makeObservation({ id: 'old' })]));
    await first;

    expect(store.observations().map((o) => o.id)).toEqual(['new']);
    expect(store.status()).toBe('success');
  });

  it('ignores a stale failure after a newer success', async () => {
    const { store, api } = setup('recent');
    const slow = deferred<ObservationsResponse>();
    api.getRecentObservations.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(makeResponse([makeObservation({ id: 'ok' })]));
    store.species.set(HOUSE_SPARROW);
    const first = store.search();
    await store.search();
    slow.reject(new HttpErrorResponse({ status: 500 }));
    await first;
    expect(store.error()).toBeNull();
    expect(store.observations().map((o) => o.id)).toEqual(['ok']);
  });

  describe('history mode', () => {
    it('blocks invalid or future dates before any request', async () => {
      const { store, historical } = setup('history');
      store.species.set(HOUSE_SPARROW);

      store.date.set({ year: 2025, month: 2, day: 30 });
      await store.search();
      expect(store.dateError()).toMatch(/does not exist/);

      store.date.set({ year: 2026, month: 10, day: 23 });
      await store.search();
      expect(store.dateError()).toMatch(/future/);

      expect(historical.getForDate).not.toHaveBeenCalled();
    });

    it('requests the selected country, date and canonical species code', async () => {
      const { store, historical, recent } = setup('history');
      historical.getForDate.mockResolvedValue(makeResponse([], 'historic'));
      store.species.set(HOUSE_SPARROW);
      store.countryCode.set('JP');
      store.date.set({ year: 2025, month: 11, day: 15 });

      await store.search();

      expect(historical.getForDate).toHaveBeenCalledWith('JP', { year: 2025, month: 11, day: 15 }, 'houspa');
      expect(store.isEmptyResult()).toBe(true);
      expect(recent.entries()[0]).toMatchObject({ mode: 'history', date: { year: 2025, month: 11, day: 15 } });
    });

    it('restores a recent search into the form and reruns it', async () => {
      const { store, historical } = setup('history');
      historical.getForDate.mockResolvedValue(makeResponse([], 'historic'));
      await store.restore({
        mode: 'history',
        speciesCode: 'houspa',
        commonName: 'House Sparrow',
        scientificName: 'Passer domesticus',
        countryCode: 'GB',
        date: { year: 2024, month: 2, day: 29 },
        timestamp: 1,
      });
      expect(store.species()?.speciesCode).toBe('houspa');
      expect(store.countryCode()).toBe('GB');
      expect(store.date()).toEqual({ year: 2024, month: 2, day: 29 });
      expect(historical.getForDate).toHaveBeenCalledWith('GB', { year: 2024, month: 2, day: 29 }, 'houspa');
    });
  });
});
