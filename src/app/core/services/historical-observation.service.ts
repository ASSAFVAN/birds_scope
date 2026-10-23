import { Injectable, inject } from '@angular/core';
import type { HistoricDate } from '../models/bird-search.model';
import type { ObservationsResponse } from '../models/observation.model';
import { EbirdApiService } from './ebird-api.service';

/**
 * All historic-data logic lives here so a future version can add date ranges
 * or an archive-backed source (e.g. the eBird Basic Dataset) without touching
 * the UI or the store.
 *
 * v1: exactly one request per search, for one specific date.
 */
@Injectable({ providedIn: 'root' })
export class HistoricalObservationService {
  private readonly api = inject(EbirdApiService);

  async getForDate(regionCode: string, date: HistoricDate, speciesCode: string): Promise<ObservationsResponse> {
    const response = await this.api.getHistoricObservations(regionCode, date, speciesCode);
    // The eBird historic endpoint returns every species for the date. The
    // server already filters, but filter again so the UI contract holds even
    // if the server is configured differently.
    const observations = response.observations.filter((o) => o.speciesCode === speciesCode);
    return { observations, meta: { ...response.meta, speciesCode } };
  }
}
