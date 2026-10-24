import type { BirdSpecies } from '../app/core/models/bird-species.model';
import type { Observation, ObservationsResponse } from '../app/core/models/observation.model';

export const HOUSE_SPARROW: BirdSpecies = {
  speciesCode: 'houspa',
  commonName: 'House Sparrow',
  scientificName: 'Passer domesticus',
  category: 'species',
  taxonOrder: 30000,
  familyCommonName: 'Old World Sparrows',
  hebrewName: 'דרור הבית',
};

export const COMMON_KINGFISHER: BirdSpecies = {
  speciesCode: 'comkin1',
  commonName: 'Common Kingfisher',
  scientificName: 'Alcedo atthis',
  category: 'species',
  taxonOrder: 12000,
  familyCommonName: 'Kingfishers',
  hebrewName: 'שלדג גמדי',
};

export const SPANISH_SPARROW: BirdSpecies = {
  speciesCode: 'spaspa1',
  commonName: 'Spanish Sparrow',
  scientificName: 'Passer hispaniolensis',
  category: 'species',
  taxonOrder: 30001,
  familyCommonName: 'Old World Sparrows',
  hebrewName: null,
};

export const TAXONOMY: BirdSpecies[] = [COMMON_KINGFISHER, HOUSE_SPARROW, SPANISH_SPARROW];

export function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    speciesCode: 'houspa',
    commonName: 'House Sparrow',
    scientificName: 'Passer domesticus',
    hebrewName: null,
    locationId: 'L1',
    locationName: 'Haifa Bay',
    count: 3,
    date: '2025-11-15',
    time: '08:30',
    latitude: 32.8,
    longitude: 35.05,
    checklistId: 'S123',
    valid: true,
    reviewed: false,
    locationPrivate: false,
    ...overrides,
  };
}

export function makeResponse(observations: Observation[], endpoint: 'recent' | 'historic' = 'recent'): ObservationsResponse {
  return {
    observations,
    meta: {
      endpoint,
      regionCode: 'IL',
      speciesCode: null,
      backDays: endpoint === 'recent' ? 10 : null,
      date: endpoint === 'historic' ? '2025-11-15' : null,
      upstreamCount: observations.length,
      truncated: false,
      maxResults: 5000,
      coverage: 'test coverage',
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
