import type { Observation } from '../../core/models/observation.model';

export type SortColumn = 'commonName' | 'scientificName' | 'locationName' | 'count' | 'observedAt' | 'latitude' | 'longitude';

/**
 * MatTableDataSource sorting accessor. Text sorts case-insensitively, numbers
 * numerically, dates by their ISO-like string. Missing values map to '' or a
 * sentinel number so they always group together at one end instead of
 * comparing inconsistently.
 */
export function observationSortAccessor(o: Observation, column: string): string | number {
  switch (column as SortColumn) {
    case 'commonName':
      return o.commonName.toLocaleLowerCase();
    case 'scientificName':
      return o.scientificName.toLocaleLowerCase();
    case 'locationName':
      return (o.locationName ?? '').toLocaleLowerCase();
    case 'count':
      // "Present (not counted)" sorts below any real count.
      return o.count ?? -1;
    case 'observedAt':
      // "YYYY-MM-DD HH:mm" strings sort chronologically; date-only sorts before timed entries of that day.
      return o.date ? `${o.date} ${o.time ?? ''}`.trim() : '';
    case 'latitude':
      return o.latitude ?? -Infinity;
    case 'longitude':
      return o.longitude ?? -Infinity;
    default:
      return '';
  }
}
