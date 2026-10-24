import { describe, expect, it } from 'vitest';
import { makeObservation } from '../../testing/fixtures';
import { boundsOf, buildPopupContent, isValidCoordinate, toMarkerData } from './map-markers.utils';

describe('map marker utils', () => {
  it.each([
    [32.8, 35.0, true],
    [-90, 180, true],
    [null, 35, false],
    [32.8, undefined, false],
    [NaN, 35, false],
    [91, 35, false],
    [32, -181, false],
    [0, 0, false],
    ['32.8', 35, false],
  ])('isValidCoordinate(%s, %s) → %s', (lat, lng, expected) => {
    expect(isValidCoordinate(lat, lng)).toBe(expected);
  });

  it('creates markers only for valid coordinates', () => {
    const { markers, invalidCount } = toMarkerData([
      makeObservation({ id: 'ok' }),
      makeObservation({ id: 'no-lat', latitude: null }),
      makeObservation({ id: 'bad', latitude: 120 }),
      makeObservation({ id: 'zero', latitude: 0, longitude: 0 }),
    ]);
    expect(markers.map((m) => m.id)).toEqual(['ok']);
    expect(invalidCount).toBe(3);
  });

  it('computes bounds', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ lat: 1, lng: 2 }, { lat: -3, lng: 5 }])).toEqual([[-3, 2], [1, 5]]);
  });

  it('renders popup text safely (no HTML injection)', () => {
    const el = buildPopupContent(
      makeObservation({ locationName: '<img src=x onerror=alert(1)>', count: null, time: null }),
    );
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el.textContent).toContain('Present (not counted)');
    expect(el.textContent).toContain('2025-11-15');
    expect(el.textContent).toContain('House Sparrow');
    expect(el.textContent).toContain('Passer domesticus');
  });

  it('shows the Hebrew name right-to-left when there is one', () => {
    const he = buildPopupContent(makeObservation({ hebrewName: 'דרור הבית' })).querySelector<HTMLElement>('.obs-popup__he');
    expect(he?.textContent).toBe('דרור הבית');
    expect(he?.dir).toBe('rtl');
    expect(buildPopupContent(makeObservation()).querySelector('.obs-popup__he')).toBeNull();
  });

  it('adds Waze and Google Maps navigation links for the observation coordinates', () => {
    const el = buildPopupContent(makeObservation({ latitude: 32.5599506, longitude: 35.3886795 }));
    const links = [...el.querySelectorAll<HTMLAnchorElement>('a.obs-popup__nav-link')];
    expect(links.map((a) => a.href)).toEqual([
      'https://waze.com/ul?ll=32.559951,35.388680&navigate=yes',
      'https://www.google.com/maps/dir/?api=1&destination=32.559951,35.388680',
    ]);
    expect(links.every((a) => a.target === '_blank' && a.rel.includes('noopener'))).toBe(true);
  });

  it('omits navigation links when the coordinates are invalid', () => {
    const el = buildPopupContent(makeObservation({ latitude: null }));
    expect(el.querySelector('.obs-popup__nav')).toBeNull();
  });
});
