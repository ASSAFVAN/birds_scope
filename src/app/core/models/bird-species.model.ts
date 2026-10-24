/** A taxonomy entry from GET /api/taxonomy (eBird /ref/taxonomy/ebird, cat=species). */
export interface BirdSpecies {
  /** Canonical eBird species code, e.g. "houspa". */
  speciesCode: string;
  commonName: string;
  scientificName: string;
  category: string;
  taxonOrder: number | null;
  familyCommonName: string | null;
  /** Official Hebrew name from eBird, null when eBird has none. */
  hebrewName: string | null;
}

/** A country from GET /api/countries (eBird /ref/region/list/country/world). */
export interface Country {
  /** eBird region code, e.g. "IL". */
  code: string;
  name: string;
}

export const formatSpecies = (s: Pick<BirdSpecies, 'commonName' | 'scientificName'> | null | undefined): string =>
  s ? (s.scientificName ? `${s.commonName} (${s.scientificName})` : s.commonName) : '';
