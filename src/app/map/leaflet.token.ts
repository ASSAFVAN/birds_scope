/// <reference types="leaflet.markercluster" />
import { InjectionToken } from '@angular/core';
import type * as Leaflet from 'leaflet';

export type LeafletNamespace = typeof Leaflet;

/**
 * Leaflet and Leaflet.markercluster are loaded as global scripts (angular.json
 * "scripts"), because markercluster patches the global `L`. Injecting the
 * namespace through a token keeps it swappable with a fake in unit tests.
 */
export const LEAFLET = new InjectionToken<LeafletNamespace>('LEAFLET', {
  providedIn: 'root',
  factory: () => {
    const L = (globalThis as { L?: LeafletNamespace }).L;
    if (!L || typeof L.markerClusterGroup !== 'function') {
      throw new Error('Leaflet / Leaflet.markercluster are not loaded. Check the "scripts" section in angular.json.');
    }
    return L;
  },
});
