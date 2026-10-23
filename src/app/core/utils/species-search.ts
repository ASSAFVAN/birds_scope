import type { BirdSpecies } from '../models/bird-species.model';

export interface IndexedSpecies {
  species: BirdSpecies;
  common: string;
  scientific: string;
}

/** Lowercase, strip accents and punctuation so "Kingfisher, Common" ≈ "common kingfisher". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildSpeciesIndex(species: readonly BirdSpecies[]): IndexedSpecies[] {
  return species.map((s) => ({
    species: s,
    common: normalizeSearchText(s.commonName),
    scientific: normalizeSearchText(s.scientificName),
  }));
}

function score(entry: IndexedSpecies, query: string, tokens: string[]): number {
  const { common, scientific } = entry;
  if (common === query || scientific === query) return 0;
  if (common.startsWith(query)) return 1;
  if (scientific.startsWith(query)) return 2;
  const words = `${common} ${scientific}`.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return 3;
  if (common.includes(query) || scientific.includes(query)) return 4;
  return -1;
}

/**
 * Case-insensitive local search over common and scientific names.
 * Ranking: exact → common-name prefix → scientific prefix → all words match → substring.
 */
export function filterSpecies(index: readonly IndexedSpecies[], rawQuery: string, limit = 30): BirdSpecies[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) return [];
  const tokens = query.split(' ');
  const buckets: BirdSpecies[][] = [[], [], [], [], []];
  for (const entry of index) {
    const s = score(entry, query, tokens);
    if (s >= 0) buckets[s]!.push(entry.species);
  }
  return buckets.flat().slice(0, limit);
}
