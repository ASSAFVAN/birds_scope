import { Injectable, computed, inject, signal } from '@angular/core';
import { type AppError, toAppError } from '../models/api-error.model';
import type { BirdSpecies } from '../models/bird-species.model';
import { buildSpeciesIndex, filterSpecies } from '../utils/species-search';
import { EbirdApiService } from './ebird-api.service';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Loads the eBird species taxonomy once (cached by the server too) and serves
 * suggestions by filtering it locally as the user types.
 */
@Injectable({ providedIn: 'root' })
export class SpeciesService {
  private readonly api = inject(EbirdApiService);
  private readonly speciesState = signal<readonly BirdSpecies[]>([]);
  private loadPromise: Promise<void> | null = null;

  readonly status = signal<LoadStatus>('idle');
  readonly error = signal<AppError | null>(null);
  readonly species = this.speciesState.asReadonly();
  readonly index = computed(() => buildSpeciesIndex(this.speciesState()));
  readonly byCode = computed(() => new Map(this.speciesState().map((s) => [s.speciesCode, s])));

  /** Idempotent: concurrent and repeated calls share a single HTTP request. */
  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.status.set('loading');
    this.error.set(null);
    this.loadPromise = this.api
      .getTaxonomy()
      .then((species) => {
        this.speciesState.set(species);
        this.status.set('ready');
      })
      .catch((err: unknown) => {
        this.error.set(toAppError(err));
        this.status.set('error');
        this.loadPromise = null; // allow retry
      });
    return this.loadPromise;
  }

  search(query: string, limit = 30): BirdSpecies[] {
    return filterSpecies(this.index(), query, limit);
  }
}
