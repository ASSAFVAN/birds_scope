import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeLeaflet } from '../../../testing/fake-leaflet';
import { makeObservation } from '../../../testing/fixtures';
import { LEAFLET } from '../leaflet.token';
import { ObservationMapComponent } from './observation-map.component';

describe('ObservationMapComponent', () => {
  let fake: ReturnType<typeof createFakeLeaflet>;

  /** Let pending setTimeout(0) work (the deferred invalidateSize) run. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

  beforeEach(() => {
    fake = createFakeLeaflet();
    TestBed.configureTestingModule({
      imports: [ObservationMapComponent],
      providers: [provideZonelessChangeDetection(), { provide: LEAFLET, useValue: fake.L }],
    });
  });

  async function render(active: boolean) {
    const fixture = TestBed.createComponent(ObservationMapComponent);
    fixture.componentRef.setInput('observations', [makeObservation({ id: 'a' })]);
    fixture.componentRef.setInput('active', active);
    await fixture.whenStable();
    await tick();
    return fixture;
  }

  it('creates the map once and only updates markers when observations change', async () => {
    const mapSpy = vi.spyOn(fake.L, 'map');
    const fixture = await render(true);
    expect(fake.state.cluster!.layers).toHaveLength(1);

    fixture.componentRef.setInput('observations', [makeObservation({ id: 'a' }), makeObservation({ id: 'b', latitude: 31 })]);
    await fixture.whenStable();

    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(fake.state.cluster!.layers).toHaveLength(2);
  });

  it('resizes the map after it becomes visible again', async () => {
    const fixture = await render(false);
    const before = fake.state.map!.invalidateSizeCalls;

    fixture.componentRef.setInput('active', true);
    await fixture.whenStable();
    await tick();

    expect(fake.state.map!.invalidateSizeCalls).toBeGreaterThan(before);
  });

  it('emits markerSelect when a marker is clicked, and highlights the selectedId input', async () => {
    const fixture = await render(true);
    const emitted: string[] = [];
    fixture.componentInstance.markerSelect.subscribe((id) => emitted.push(id));

    fake.state.cluster!.layers[0]!.fire('click');
    expect(emitted).toEqual(['a']);

    fixture.componentRef.setInput('selectedId', 'a');
    await fixture.whenStable();
    expect(fake.state.cluster!.layers[0]!.options.icon.className).toContain('bird-pin--selected');
  });

  it('removes the map when destroyed', async () => {
    const fixture = await render(true);
    const map = fake.state.map!;
    fixture.destroy();
    expect(map.removed).toBe(true);
  });
});
