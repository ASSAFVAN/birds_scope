/**
 * Raw eBird API v2 response shapes (only the documented fields we use) and
 * their normalization into the JSON contract served to the Angular client.
 */

export interface RawTaxon {
  sciName?: string;
  comName?: string;
  speciesCode?: string;
  category?: string;
  taxonOrder?: number;
  familyComName?: string;
  familySciName?: string;
  extinct?: boolean;
}

export interface RawObservation {
  speciesCode?: string;
  comName?: string;
  sciName?: string;
  locId?: string;
  locName?: string;
  obsDt?: string; // "YYYY-MM-DD HH:mm" or "YYYY-MM-DD" when no time was reported
  howMany?: number; // absent when the observer recorded "X" (present, not counted)
  lat?: number;
  lng?: number;
  obsValid?: boolean;
  obsReviewed?: boolean;
  locationPrivate?: boolean;
  subId?: string;
  obsId?: string;
}

export interface RawRegion {
  code?: string;
  name?: string;
}

export interface BirdSpecies {
  speciesCode: string;
  commonName: string;
  scientificName: string;
  category: string;
  taxonOrder: number | null;
  familyCommonName: string | null;
  /** Official Hebrew name from eBird's Hebrew taxonomy (locale=he), null when eBird has none. */
  hebrewName: string | null;
}

export interface Country {
  code: string;
  name: string;
}

export interface Observation {
  id: string;
  speciesCode: string;
  commonName: string;
  scientificName: string;
  /** Filled in by EbirdService from the Hebrew taxonomy; null when unknown. */
  hebrewName: string | null;
  locationId: string | null;
  locationName: string | null;
  /** null = species reported as present without a count ("X"). */
  count: number | null;
  /** YYYY-MM-DD, or null if eBird did not provide a parseable date. */
  date: string | null;
  /** HH:mm, or null when the observer did not report a time. */
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  checklistId: string | null;
  valid: boolean | null;
  reviewed: boolean | null;
  locationPrivate: boolean | null;
}

export function normalizeTaxon(raw: RawTaxon): BirdSpecies | null {
  if (!raw.speciesCode || !raw.comName || !raw.sciName) return null;
  return {
    speciesCode: raw.speciesCode,
    commonName: raw.comName,
    scientificName: raw.sciName,
    category: raw.category ?? 'species',
    taxonOrder: typeof raw.taxonOrder === 'number' ? raw.taxonOrder : null,
    familyCommonName: raw.familyComName ?? null,
    hebrewName: null,
  };
}

export function normalizeCountry(raw: RawRegion): Country | null {
  if (!raw.code || !raw.name) return null;
  return { code: raw.code, name: raw.name };
}

const OBS_DT = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/;

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeObservation(raw: RawObservation, index: number): Observation | null {
  if (!raw.speciesCode) return null;
  const match = raw.obsDt ? OBS_DT.exec(raw.obsDt) : null;
  const count = finiteOrNull(raw.howMany);
  const idParts = [raw.speciesCode, raw.obsId ?? raw.subId ?? raw.locId ?? 'na', raw.obsDt ?? 'na'];
  return {
    // eBird returns one record per species per location, so this is unique in
    // practice; the index suffix guarantees uniqueness regardless.
    id: `${idParts.join('|')}#${index}`,
    speciesCode: raw.speciesCode,
    commonName: raw.comName ?? raw.speciesCode,
    scientificName: raw.sciName ?? '',
    hebrewName: null,
    locationId: raw.locId ?? null,
    locationName: raw.locName ?? null,
    count: count !== null && count >= 0 ? count : null,
    date: match?.[1] ?? null,
    time: match?.[2] ?? null,
    latitude: finiteOrNull(raw.lat),
    longitude: finiteOrNull(raw.lng),
    checklistId: raw.subId ?? null,
    valid: typeof raw.obsValid === 'boolean' ? raw.obsValid : null,
    reviewed: typeof raw.obsReviewed === 'boolean' ? raw.obsReviewed : null,
    locationPrivate: typeof raw.locationPrivate === 'boolean' ? raw.locationPrivate : null,
  };
}

export function normalizeObservations(raw: unknown): Observation[] {
  if (!Array.isArray(raw)) return [];
  const out: Observation[] = [];
  raw.forEach((item, i) => {
    if (item && typeof item === 'object') {
      const obs = normalizeObservation(item as RawObservation, i);
      if (obs) out.push(obs);
    }
  });
  return out;
}
