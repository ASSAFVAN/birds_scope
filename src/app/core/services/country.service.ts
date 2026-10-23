import { Injectable, inject, signal } from '@angular/core';
import { type AppError, toAppError } from '../models/api-error.model';
import type { Country } from '../models/bird-species.model';
import { EbirdApiService } from './ebird-api.service';
import type { LoadStatus } from './species.service';

/** eBird country list (valid region codes), loaded once from the proxy. */
@Injectable({ providedIn: 'root' })
export class CountryService {
  private readonly api = inject(EbirdApiService);
  private loadPromise: Promise<void> | null = null;

  readonly countries = signal<readonly Country[]>([]);
  readonly status = signal<LoadStatus>('idle');
  readonly error = signal<AppError | null>(null);

  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.status.set('loading');
    this.error.set(null);
    this.loadPromise = this.api
      .getCountries()
      .then((countries) => {
        this.countries.set(countries);
        this.status.set('ready');
      })
      .catch((err: unknown) => {
        this.error.set(toAppError(err));
        this.status.set('error');
        this.loadPromise = null;
      });
    return this.loadPromise;
  }

  nameFor(code: string): string {
    return this.countries().find((c) => c.code === code)?.name ?? code;
  }
}
