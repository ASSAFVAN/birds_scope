import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMON_KINGFISHER, HOUSE_SPARROW, TAXONOMY } from '../../../testing/fixtures';
import { buildSpeciesIndex, filterSpecies } from '../utils/species-search';
import { SpeciesService } from './species.service';

describe('filterSpecies', () => {
  const index = buildSpeciesIndex(TAXONOMY);

  it('finds the same species code by common name and by scientific name', () => {
    const byCommon = filterSpecies(index, 'house sparrow');
    const bySci = filterSpecies(index, 'Passer domesticus');
    expect(byCommon[0]?.speciesCode).toBe('houspa');
    expect(bySci[0]?.speciesCode).toBe('houspa');
    expect(byCommon[0]).toBe(bySci[0]);
  });

  it('matches case-insensitively and by partial words', () => {
    expect(filterSpecies(index, 'HOUSE SP')[0]?.speciesCode).toBe(HOUSE_SPARROW.speciesCode);
    expect(filterSpecies(index, 'alcedo')[0]?.speciesCode).toBe(COMMON_KINGFISHER.speciesCode);
    expect(filterSpecies(index, 'king com').map((s) => s.speciesCode)).toEqual(['comkin1']);
  });

  it('ranks prefix matches before substring matches', () => {
    const results = filterSpecies(index, 'passer');
    expect(results.map((s) => s.speciesCode)).toEqual(['houspa', 'spaspa1']);
  });

  it('returns nothing for short or unmatched queries', () => {
    expect(filterSpecies(index, 'h')).toEqual([]);
    expect(filterSpecies(index, 'penguin')).toEqual([]);
  });
});

describe('SpeciesService', () => {
  let service: SpeciesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SpeciesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the taxonomy once and filters locally afterwards', async () => {
    const first = service.load();
    const second = service.load();
    expect(service.status()).toBe('loading');

    http.expectOne('/api/taxonomy').flush(TAXONOMY);
    await Promise.all([first, second]);
    await service.load();

    expect(service.status()).toBe('ready');
    expect(service.search('sparrow').map((s) => s.speciesCode)).toEqual(['houspa', 'spaspa1']);
    expect(service.search('kingfisher')[0]?.speciesCode).toBe('comkin1');
    http.expectNone('/api/taxonomy'); // no extra requests while typing
  });

  it('exposes an error and allows retry when loading fails', async () => {
    const attempt = service.load();
    http.expectOne('/api/taxonomy').flush({ error: { code: 'API_KEY_MISSING', message: 'No key' } }, { status: 503, statusText: 'x' });
    await attempt;
    expect(service.status()).toBe('error');
    expect(service.error()?.code).toBe('API_KEY_MISSING');

    const retry = service.load();
    http.expectOne('/api/taxonomy').flush(TAXONOMY);
    await retry;
    expect(service.status()).toBe('ready');
  });
});
