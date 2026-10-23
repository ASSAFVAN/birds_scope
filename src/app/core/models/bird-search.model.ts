export type SearchMode = 'recent' | 'history';
export type ResultView = 'map' | 'table';

/** Year/month/day as chosen in the form. Month is 1-12. */
export interface HistoricDateValue {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface HistoricDate {
  year: number;
  month: number;
  day: number;
}

/** One entry of the Recent Searches list persisted in localStorage. */
export interface RecentSearchEntry {
  mode: SearchMode;
  /** null = all species (recent mode only). */
  speciesCode: string | null;
  commonName: string | null;
  scientificName: string | null;
  countryCode: string;
  date: HistoricDate | null;
  /** epoch milliseconds */
  timestamp: number;
}
