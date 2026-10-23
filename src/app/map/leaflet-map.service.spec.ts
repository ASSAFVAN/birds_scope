import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeLeaflet } from '../../testing/fake-leaflet';
import { makeObservation } from '../../testing/fixtures';
import { LEAFLET } from './leaflet.token';
import { LeafletMapService } from './leaflet-map.service';

function sizedContainer(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => height });
  return el;
}

describe('LeafletMapService', () => {
  let fake: ReturnType<typeof createFakeLeaflet>;
  let service: LeafletMapService;

  beforeEach(() => {
    fake = createFakeLeaflet();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LEAFLET, useValue: fake.L }, LeafletMapService],
    });
    service = TestBed.inject(LeafletMapService);
  });

  it('does not create markers for invalid coordinates', () => {
    service.init(sizedContainer(400, 300), () => undefined);
    const summary = service.setObservations([
      makeObservation({ id: 'a' }),
      makeObservation({ id: 'b', latitude: null }),
      makeObservation({ id: 'c', longitude: 999 }),
    ]);
    expect(summary).toEqual({ rendered: 1, skipped: 2 });
    expect(fake.state.cluster!.layers).toHaveLength(1);
  });

  it('reports marker clicks and highlights the selected marker', () => {
    const onSelect = vi.fn();
    service.init(sizedContainer(400, 300), onSelect);
    service.setObservations([makeObservation({ id: 'a' }), makeObservation({ id: 'b', latitude: 31 })]);
    const [a, b] = fake.state.cluster!.layers;

    b!.fire('click');
    expect(onSelect).toHaveBeenCalledWith('b');

    service.select('b');
    expect(b!.options.icon.className).toContain('bird-pin--selected');
    expect(b!.popupOpened).toBe(1);

    service.select('a');
    expect(a!.options.icon.className).toContain('bird-pin--selected');
    expect(b!.options.icon.className).not.toContain('bird-pin--selected');
  });

  it('keeps the selection highlighted when markers are rebuilt', () => {
    service.init(sizedContainer(400, 300), () => undefined);
    service.select('a');
    service.setObservations([makeObservation({ id: 'a' })]);
    expect(fake.state.cluster!.layers[0]!.options.icon.className).toContain('bird-pin--selected');
  });

  it('fits to results, deferring the fit while the map is hidden', () => {
    let width = 0;
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { get: () => width });
    Object.defineProperty(el, 'clientHeight', { get: () => width });
    service.init(el, () => undefined);

    service.setObservations([makeObservation()]);
    expect(fake.state.map!.fitBoundsCalls).toHaveLength(0);

    width = 300; // becomes visible
    service.invalidateSize();
    expect(fake.state.map!.invalidateSizeCalls).toBe(1);
    expect(fake.state.map!.fitBoundsCalls).toHaveLength(1);
  });

  it('removes the map on destroy', () => {
    service.init(sizedContainer(400, 300), () => undefined);
    const map = fake.state.map!;
    service.destroy();
    expect(map.removed).toBe(true);
    expect(service.isReady).toBe(false);
  });
});
