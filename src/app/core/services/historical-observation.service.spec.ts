import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeObservation, makeResponse } from '../../../testing/fixtures';
import { EbirdApiService } from './ebird-api.service';
import { HistoricalObservationService } from './historical-observation.service';

describe('HistoricalObservationService / EbirdApiService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends one historic request with country, year, month and day', async () => {
    const service = TestBed.inject(HistoricalObservationService);
    const result = service.getForDate('IL', { year: 2025, month: 1, day: 5 }, 'houspa');

    const req = http.expectOne((r) => r.url === '/api/observations/historic/IL/2025/01/05');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('species')).toBe('houspa');
    req.flush(makeResponse([], 'historic'));
    await result;
  });

  it('keeps only observations of the selected canonical species code', async () => {
    const service = TestBed.inject(HistoricalObservationService);
    const result = service.getForDate('IL', { year: 2025, month: 11, day: 15 }, 'houspa');

    http.expectOne((r) => r.url.startsWith('/api/observations/historic/IL/2025/11/15')).flush(
      makeResponse(
        [
          makeObservation({ id: '1', speciesCode: 'houspa' }),
          makeObservation({ id: '2', speciesCode: 'spaspa1', commonName: 'Spanish Sparrow' }),
          // Same common name text, different code: must not be included.
          makeObservation({ id: '3', speciesCode: 'houspa1', commonName: 'House Sparrow' }),
        ],
        'historic',
      ),
    );

    const { observations, meta } = await result;
    expect(observations.map((o) => o.id)).toEqual(['1']);
    expect(meta.speciesCode).toBe('houspa');
  });

  it('calls the recent endpoint with an optional species parameter', async () => {
    const api = TestBed.inject(EbirdApiService);
    const one = api.getRecentObservations('JP', 'comkin1');
    const req1 = http.expectOne((r) => r.url === '/api/observations/recent/JP');
    expect(req1.request.params.get('species')).toBe('comkin1');
    req1.flush(makeResponse([]));
    await one;

    const all = api.getRecentObservations('JP', null);
    const req2 = http.expectOne((r) => r.url === '/api/observations/recent/JP');
    expect(req2.request.params.has('species')).toBe(false);
    req2.flush(makeResponse([]));
    await all;
  });
});
