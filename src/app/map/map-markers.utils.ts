import { type Observation, formatCount, formatObservedAt } from '../core/models/observation.model';

export interface MarkerDatum {
  id: string;
  lat: number;
  lng: number;
  title: string;
  observation: Observation;
}

/** Finite, in range, and not the (0, 0) "null island" placeholder. */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Splits observations into mappable markers and a count of ones without usable coordinates. */
export function toMarkerData(observations: readonly Observation[]): { markers: MarkerDatum[]; invalidCount: number } {
  const markers: MarkerDatum[] = [];
  let invalidCount = 0;
  for (const o of observations) {
    if (isValidCoordinate(o.latitude, o.longitude)) {
      markers.push({
        id: o.id,
        lat: o.latitude!,
        lng: o.longitude!,
        title: `${o.commonName} — ${o.locationName ?? 'Unknown location'}`,
        observation: o,
      });
    } else {
      invalidCount++;
    }
  }
  return { markers, invalidCount };
}

/** [[south, west], [north, east]] or null when there are no points. */
export function boundsOf(markers: readonly Pick<MarkerDatum, 'lat' | 'lng'>[]): [[number, number], [number, number]] | null {
  if (!markers.length) return null;
  let south = 90, west = 180, north = -90, east = -180;
  for (const { lat, lng } of markers) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [[south, west], [north, east]];
}

/**
 * Popup content built with DOM nodes and textContent only, so API-sourced
 * strings (location names etc.) can never inject HTML.
 */
export function buildPopupContent(o: Observation, doc: Document = document): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'obs-popup';

  const title = doc.createElement('strong');
  title.className = 'obs-popup__title';
  title.textContent = o.commonName;
  root.appendChild(title);

  if (o.scientificName) {
    const sci = doc.createElement('em');
    sci.className = 'obs-popup__sci';
    sci.textContent = o.scientificName;
    root.appendChild(sci);
  }

  const list = doc.createElement('dl');
  const rows: [string, string][] = [
    ['Location', o.locationName ?? 'Unknown location'],
    ['Count', formatCount(o.count)],
    ['Date', formatObservedAt(o)],
  ];
  if (o.latitude !== null && o.longitude !== null) {
    rows.push(['Coordinates', `${o.latitude.toFixed(4)}, ${o.longitude.toFixed(4)}`]);
  }
  for (const [label, value] of rows) {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  root.appendChild(list);

  if (o.checklistId && /^S\d+$/.test(o.checklistId)) {
    const link = doc.createElement('a');
    link.href = `https://ebird.org/checklist/${o.checklistId}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View checklist on eBird';
    root.appendChild(link);
  }
  return root;
}
