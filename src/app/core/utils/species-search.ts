import type { BirdSpecies } from '../models/bird-species.model';

export interface IndexedSpecies {
  species: BirdSpecies;
  common: string;
  scientific: string;
  hebrew: string;
}

const HEBREW_FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * Lowercase, strip accents and punctuation so "Kingfisher, Common" ≈ "common kingfisher".
 * Hebrew letters are kept, with niqqud removed and final forms mapped to regular
 * ones, so a half-typed "בז ער" still matches "בז ערב".
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => HEBREW_FINAL_LETTERS[c]!)
    .replace(/[^a-z0-9\u05d0-\u05ea]+/g, ' ')
    .trim();
}

export function buildSpeciesIndex(species: readonly BirdSpecies[]): IndexedSpecies[] {
  return species.map((s) => ({
    species: s,
    common: normalizeSearchText(s.commonName),
    scientific: normalizeSearchText(s.scientificName),
    hebrew: s.hebrewName ? normalizeSearchText(s.hebrewName) : '',
  }));
}

function score(entry: IndexedSpecies, query: string, tokens: string[]): number {
  const { common, scientific, hebrew } = entry;
  if (common === query || scientific === query || (hebrew && hebrew === query)) return 0;
  if (common.startsWith(query) || (hebrew && hebrew.startsWith(query))) return 1;
  if (scientific.startsWith(query)) return 2;
  const words = `${common} ${scientific} ${hebrew}`.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return 3;
  if (common.includes(query) || scientific.includes(query) || hebrew.includes(query)) return 4;
  return -1;
}

/**
 * Case-insensitive local search over common, scientific and Hebrew names.
 * Ranking: exact → common/Hebrew-name prefix → scientific prefix → all words match → substring.
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
