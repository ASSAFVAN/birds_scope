import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { type AppError, appError, toAppError } from '../models/api-error.model';
import type { BirdSpecies } from '../models/bird-species.model';
import type { HistoricDate, HistoricDateValue, RecentSearchEntry, ResultView, SearchMode } from '../models/bird-search.model';
import type { Observation, ObservationMeta, ObservationsResponse } from '../models/observation.model';
import { EbirdApiService } from '../services/ebird-api.service';
import { HistoricalObservationService } from '../services/historical-observation.service';
import { RecentSearchService } from '../services/recent-search.service';
import { NOW } from '../utils/clock';
import { DATE_ERROR_MESSAGES, toHistoricDate, validateHistoricDate, yesterday } from '../utils/date.utils';
import { isValidCoordinate } from '../../map/map-markers.utils';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

/** Which section this store instance serves. Provided by each feature component. */
export const SEARCH_MODE = new InjectionToken<SearchMode>('SEARCH_MODE');

export const DEFAULT_COUNTRY = 'IL';

/**
 * Signal-based state for one search section (Recent or History).
 * Each feature component provides its own instance, so the two tabs keep
 * independent criteria and results. The Leaflet map is NOT stored here.
 */
@Injectable()
export class ObservationSearchStore {
  private readonly api = inject(EbirdApiService);
  private readonly historical = inject(HistoricalObservationService);
  private readonly recentSearches = inject(RecentSearchService);
  private readonly now = inject(NOW);

  readonly mode = inject(SEARCH_MODE);

  // ---- criteria -----------------------------------------------------------
  readonly species = signal<BirdSpecies | null>(null);
  /** Recent mode only: search all species instead of one. */
  readonly allSpecies = signal(false);
  readonly countryCode = signal<string>(DEFAULT_COUNTRY);
  readonly date = signal<HistoricDateValue>(yesterday(this.now()));

  // ---- results / UI -------------------------------------------------------
  readonly view = signal<ResultView>('map');
  readonly observations = signal<readonly Observation[]>([]);
  readonly meta = signal<ObservationMeta | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly status = signal<SearchStatus>('idle');
  readonly error = signal<AppError | null>(null);
  /** Set after a submit attempt so validation messages only show once relevant. */
  readonly submitted = signal(false);

  private requestSeq = 0;

  // ---- derived ------------------------------------------------------------
  readonly loading = computed(() => this.status() === 'loading');
  readonly count = computed(() => this.observations().length);
  readonly mappableCount = computed(
    () => this.observations().filter((o) => isValidCoordinate(o.latitude, o.longitude)).length,
  );
  readonly unmappableCount = computed(() => this.count() - this.mappableCount());
  readonly isEmptyResult = computed(() => this.status() === 'success' && this.count() === 0);
  readonly selectedObservation = computed(() => {
    const id = this.selectedId();
    return id ? (this.observations().find((o) => o.id === id) ?? null) : null;
  });

  readonly dateError = computed(() => {
    if (this.mode !== 'history') return null;
    const err = validateHistoricDate(this.date(), this.now());
    return err ? DATE_ERROR_MESSAGES[err] : null;
  });

  readonly speciesError = computed(() => {
    if (this.mode === 'recent' && this.allSpecies()) return null;
    return this.species() ? null : 'Choose a bird species from the suggestions.';
  });

  readonly countryError = computed(() => (/^[A-Z]{2}$/.test(this.countryCode()) ? null : 'Choose a country.'));

  readonly canSearch = computed(
    () => !this.speciesError() && !this.countryError() && !this.dateError() && !this.loading(),
  );

  // ---- commands -----------------------------------------------------------

  /** Validates, records the search in Recent Searches, and fetches results. */
  async search(): Promise<void> {
    this.submitted.set(true);
    if (this.speciesError() || this.countryError() || this.dateError()) return;

    const species = this.mode === 'recent' && this.allSpecies() ? null : this.species();
    const countryCode = this.countryCode();
    const date = this.mode === 'history' ? toHistoricDate(this.date(), this.now()) : null;

    this.recentSearches.add({
      mode: this.mode,
      speciesCode: species?.speciesCode ?? null,
      commonName: species?.commonName ?? null,
      scientificName: species?.scientificName ?? null,
      countryCode,
      date,
      timestamp: this.now().getTime(),
    });

    const requestId = ++this.requestSeq;
    this.status.set('loading');
    this.error.set(null);
    this.selectedId.set(null);

    try {
      const response = await this.fetch(countryCode, species?.speciesCode ?? null, date);
      if (requestId !== this.requestSeq) return; // a newer search started; drop stale result
      this.observations.set(response.observations);
      this.meta.set(response.meta);
      this.status.set('success');
    } catch (err) {
      if (requestId !== this.requestSeq) return;
      this.observations.set([]);
      this.meta.set(null);
      this.error.set(toAppError(err));
      this.status.set('error');
    }
  }

  /** Restores a Recent Searches entry into the form and reruns it. */
  restore(entry: RecentSearchEntry): Promise<void> {
    this.countryCode.set(entry.countryCode);
    if (entry.speciesCode) {
      this.allSpecies.set(false);
      this.species.set({
        speciesCode: entry.speciesCode,
        commonName: entry.commonName ?? entry.speciesCode,
        scientificName: entry.scientificName ?? '',
        category: 'species',
        taxonOrder: null,
        familyCommonName: null,
        hebrewName: null,
      });
    } else {
      this.species.set(null);
      this.allSpecies.set(this.mode === 'recent');
    }
    if (this.mode === 'history' && entry.date) this.date.set({ ...entry.date });
    return this.search();
  }

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  setView(view: ResultView): void {
    this.view.set(view);
  }

  private fetch(country: string, speciesCode: string | null, date: HistoricDate | null): Promise<ObservationsResponse> {
    if (this.mode === 'recent') return this.api.getRecentObservations(country, speciesCode);
    if (!date || !speciesCode) {
      return Promise.reject(appError('VALIDATION', 'Choose a species and a valid date.'));
    }
    return this.historical.getForDate(country, date, speciesCode);
  }
}
