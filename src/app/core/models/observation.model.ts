/** Normalized observation returned by the BirdScope API (see server/src/services/normalize.ts). */
export interface Observation {
  id: string;
  speciesCode: string;
  commonName: string;
  scientificName: string;
  locationId: string | null;
  locationName: string | null;
  /** null = reported as present without a count ("X" on the checklist). */
  count: number | null;
  /** YYYY-MM-DD, null if eBird gave no date. */
  date: string | null;
  /** HH:mm, null if the observer reported no time. */
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  checklistId: string | null;
  valid: boolean | null;
  reviewed: boolean | null;
  locationPrivate: boolean | null;
}

export interface ObservationMeta {
  endpoint: 'recent' | 'historic';
  regionCode: string;
  speciesCode: string | null;
  backDays: number | null;
  date: string | null;
  upstreamCount: number;
  truncated: boolean;
  maxResults: number;
  /** Plain-language description of what the eBird endpoint covers. */
  coverage: string;
}

export interface ObservationsResponse {
  observations: Observation[];
  meta: ObservationMeta;
}

export const formatCount = (count: number | null): string =>
  count === null ? 'Present (not counted)' : count.toLocaleString();

export const formatObservedAt = (o: Pick<Observation, 'date' | 'time'>): string =>
  o.date ? (o.time ? `${o.date} ${o.time}` : o.date) : 'Unknown date';
