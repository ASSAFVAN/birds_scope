import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BirdSpecies, Country } from '../models/bird-species.model';
import type { HistoricDate } from '../models/bird-search.model';
import type { ObservationsResponse } from '../models/observation.model';
import { pad2 } from '../utils/date.utils';

/**
 * Thin typed client for the BirdScope Express proxy (never eBird directly,
 * so the eBird API key stays on the server). Returns Promises via firstValueFrom.
 */
@Injectable({ providedIn: 'root' })
export class EbirdApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  getTaxonomy(): Promise<BirdSpecies[]> {
    return firstValueFrom(this.http.get<BirdSpecies[]>(`${this.base}/taxonomy`));
  }

  getCountries(): Promise<Country[]> {
    return firstValueFrom(this.http.get<Country[]>(`${this.base}/countries`));
  }

  /** Recent observations (last N days, configured on the server). speciesCode=null → all species. */
  getRecentObservations(regionCode: string, speciesCode: string | null): Promise<ObservationsResponse> {
    const params = speciesCode ? new HttpParams().set('species', speciesCode) : undefined;
    return firstValueFrom(
      this.http.get<ObservationsResponse>(`${this.base}/observations/recent/${encodeURIComponent(regionCode)}`, { params }),
    );
  }

  /** Observations for one specific date: /observations/historic/{region}/{YYYY}/{MM}/{DD}. */
  getHistoricObservations(regionCode: string, date: HistoricDate, speciesCode: string | null): Promise<ObservationsResponse> {
    const params = speciesCode ? new HttpParams().set('species', speciesCode) : undefined;
    const path = `${encodeURIComponent(regionCode)}/${date.year}/${pad2(date.month)}/${pad2(date.day)}`;
    return firstValueFrom(this.http.get<ObservationsResponse>(`${this.base}/observations/historic/${path}`, { params }));
  }
}
