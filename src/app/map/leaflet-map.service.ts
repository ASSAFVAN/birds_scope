import { Injectable, inject } from '@angular/core';
import type * as Leaflet from 'leaflet';
import type { Observation } from '../core/models/observation.model';
import { LEAFLET } from './leaflet.token';
import { boundsOf, buildPopupContent, toMarkerData } from './map-markers.utils';

const PIN_SVG = (fill: string) =>
  `<svg viewBox="0 0 28 40" width="28" height="40" aria-hidden="true">` +
  `<path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>` +
  // a small bird silhouette
  `<path d="M7.5 15.5c2.2-.2 3.6-1.6 4.7-3.4.7-1.2 1.9-2.3 3.6-2.3 1.4 0 2.4.7 2.9 1.7l2.3.4-2 1.2c0 3.7-3 6.3-6.8 6.3-1.9 0-3.4-.6-4.7-1.6l-1.9.6 1.5-1.4c-.1-.5-.1-1-.1-1.5z" fill="#fff"/>` +
  `</svg>`;

export interface RenderSummary {
  rendered: number;
  skipped: number;
}

/**
 * Encapsulates all Leaflet operations for one map instance: creation, the
 * clustered marker layer, popups, selection highlighting, fitting and cleanup.
 * Provided per ObservationMapComponent; never stored in application state.
 */
@Injectable()
export class LeafletMapService {
  private readonly L = inject(LEAFLET);

  private map: Leaflet.Map | null = null;
  private container: HTMLElement | null = null;
  private cluster: Leaflet.MarkerClusterGroup | null = null;
  private readonly markers = new Map<string, Leaflet.Marker>();
  private selectedId: string | null = null;
  private onSelect: (id: string) => void = () => undefined;
  private pendingBounds: Leaflet.LatLngBoundsExpression | null = null;
  private icons: { normal: Leaflet.DivIcon; selected: Leaflet.DivIcon } | null = null;

  get isReady(): boolean {
    return this.map !== null;
  }

  init(container: HTMLElement, onSelect: (id: string) => void): void {
    if (this.map) return;
    const L = this.L;
    this.container = container;
    this.onSelect = onSelect;
    this.icons = {
      normal: L.divIcon({ className: 'bird-pin', html: PIN_SVG('#2e7d5b'), iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -36] }),
      selected: L.divIcon({ className: 'bird-pin bird-pin--selected', html: PIN_SVG('#e8590c'), iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -36] }),
    };

    this.map = L.map(container, { center: [25, 10], zoom: 2, worldCopyJump: true, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: <a href="https://ebird.org">eBird</a>',
    }).addTo(this.map);

    this.cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true });
    this.map.addLayer(this.cluster);
  }

  /** Replaces all markers. Observations without valid coordinates are skipped. */
  setObservations(observations: readonly Observation[]): RenderSummary {
    if (!this.map || !this.cluster || !this.icons) return { rendered: 0, skipped: observations.length };
    const L = this.L;
    this.cluster.clearLayers();
    this.markers.clear();

    const { markers, invalidCount } = toMarkerData(observations);
    const layers: Leaflet.Marker[] = [];
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: m.id === this.selectedId ? this.icons.selected : this.icons.normal,
        title: m.title,
        alt: m.title,
        keyboard: true,
        riseOnHover: true,
      });
      // Extra top-left padding so auto-pan keeps the popup clear of the zoom control.
      marker.bindPopup(() => buildPopupContent(m.observation), { maxWidth: 280, autoPanPaddingTopLeft: [56, 16] });
      marker.on('click', () => this.onSelect(m.id));
      this.markers.set(m.id, marker);
      layers.push(marker);
    }
    this.cluster.addLayers(layers);

    if (this.selectedId && !this.markers.has(this.selectedId)) this.selectedId = null;

    const bounds = boundsOf(markers);
    if (bounds) this.fit(bounds);
    return { rendered: layers.length, skipped: invalidCount };
  }

  /** Highlights a marker; with reveal=true zooms into its cluster and opens its popup. */
  select(id: string | null, reveal = true): void {
    if (!this.icons) return;
    if (this.selectedId && this.selectedId !== id) {
      const prev = this.markers.get(this.selectedId);
      prev?.setIcon(this.icons.normal);
      prev?.setZIndexOffset(0);
    }
    this.selectedId = id;
    if (!id) return;
    const marker = this.markers.get(id);
    if (!marker) return;
    marker.setIcon(this.icons.selected);
    marker.setZIndexOffset(1000);
    if (reveal && this.cluster && this.hasSize()) {
      this.cluster.zoomToShowLayer(marker, () => marker.openPopup());
    }
  }

  /** Call after the container becomes visible or changes size. */
  invalidateSize(): void {
    if (!this.map) return;
    this.map.invalidateSize();
    if (this.pendingBounds && this.hasSize()) {
      const bounds = this.pendingBounds;
      this.pendingBounds = null;
      this.fit(bounds);
    }
  }

  destroy(): void {
    this.markers.forEach((m) => m.off());
    this.markers.clear();
    this.cluster?.clearLayers();
    this.map?.off();
    this.map?.remove();
    this.map = null;
    this.container = null;
    this.cluster = null;
    this.icons = null;
  }

  private fit(bounds: Leaflet.LatLngBoundsExpression): void {
    if (!this.map) return;
    if (!this.hasSize()) {
      // Fitting a hidden (0×0) map produces a wrong zoom; do it once it is shown.
      this.pendingBounds = bounds;
      return;
    }
    this.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
  }

  /** Uses the live container size: Leaflet's own getSize() is cached and goes stale while hidden. */
  private hasSize(): boolean {
    return !!this.container && this.container.clientWidth > 0 && this.container.clientHeight > 0;
  }
}
