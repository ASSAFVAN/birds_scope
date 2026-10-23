import type { LeafletNamespace } from '../app/map/leaflet.token';

/**
 * Minimal stand-in for the parts of Leaflet + markercluster that
 * LeafletMapService uses, so map logic can be tested without a real map.
 */
export class FakeMarker {
  readonly handlers = new Map<string, () => void>();
  popupOpened = 0;
  zIndexOffset = 0;
  constructor(
    readonly latlng: [number, number],
    public options: { icon: FakeIcon; title?: string },
  ) {}
  bindPopup() {
    return this;
  }
  on(event: string, fn: () => void) {
    this.handlers.set(event, fn);
    return this;
  }
  off() {
    this.handlers.clear();
    return this;
  }
  fire(event: string) {
    this.handlers.get(event)?.();
  }
  setIcon(icon: FakeIcon) {
    this.options.icon = icon;
    return this;
  }
  setZIndexOffset(z: number) {
    this.zIndexOffset = z;
    return this;
  }
  openPopup() {
    this.popupOpened++;
    return this;
  }
}

export interface FakeIcon {
  className: string;
}

export class FakeCluster {
  layers: FakeMarker[] = [];
  clearLayers() {
    this.layers = [];
    return this;
  }
  addLayers(layers: FakeMarker[]) {
    this.layers.push(...layers);
    return this;
  }
  zoomToShowLayer(marker: FakeMarker, cb: () => void) {
    cb();
    return marker;
  }
}

export class FakeMap {
  invalidateSizeCalls = 0;
  fitBoundsCalls: unknown[] = [];
  removed = false;
  addLayer() {
    return this;
  }
  invalidateSize() {
    this.invalidateSizeCalls++;
    return this;
  }
  fitBounds(bounds: unknown) {
    this.fitBoundsCalls.push(bounds);
    return this;
  }
  off() {
    return this;
  }
  remove() {
    this.removed = true;
    return this;
  }
}

export function createFakeLeaflet() {
  const state = { map: null as FakeMap | null, cluster: null as FakeCluster | null, markers: [] as FakeMarker[] };
  const L = {
    map: () => (state.map = new FakeMap()),
    tileLayer: () => ({ addTo: () => undefined }),
    markerClusterGroup: () => (state.cluster = new FakeCluster()),
    divIcon: (opts: FakeIcon) => ({ ...opts }),
    marker: (latlng: [number, number], options: { icon: FakeIcon; title?: string }) => {
      const m = new FakeMarker(latlng, options);
      state.markers.push(m);
      return m;
    },
  };
  return { L: L as unknown as LeafletNamespace, state };
}
