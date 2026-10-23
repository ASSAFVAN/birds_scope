import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Observation } from '../../core/models/observation.model';
import { LeafletMapService, type RenderSummary } from '../leaflet-map.service';

/**
 * Owns the map container and its lifecycle. All Leaflet calls go through
 * LeafletMapService (one instance per component). The map is created once and
 * only its marker layer is updated when observations change.
 */
@Component({
  selector: 'app-observation-map',
  templateUrl: './observation-map.component.html',
  styleUrl: './observation-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LeafletMapService],
})
export class ObservationMapComponent {
  readonly observations = input.required<readonly Observation[]>();
  readonly selectedId = input<string | null>(null);
  /** Whether the map is currently visible; the map is resized when this becomes true. */
  readonly active = input(true);

  readonly markerSelect = output<string>();

  private readonly mapService = inject(LeafletMapService);
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly ready = signal(false);
  protected readonly summary = signal<RenderSummary>({ rendered: 0, skipped: 0 });

  constructor() {
    const destroyRef = inject(DestroyRef);
    let resizeObserver: ResizeObserver | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    afterNextRender(() => {
      const el = this.mapEl().nativeElement;
      this.mapService.init(el, (id) => this.markerSelect.emit(id));
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => this.mapService.invalidateSize());
        resizeObserver.observe(el);
      }
      this.ready.set(true);
    });

    // Side effect: sync observations → Leaflet marker layer.
    effect(() => {
      const observations = this.observations();
      if (!this.ready()) return;
      this.summary.set(this.mapService.setObservations(observations));
    });

    // Side effect: sync selection → marker highlight / popup.
    effect(() => {
      const id = this.selectedId();
      this.observations(); // re-apply after markers are rebuilt
      if (!this.ready()) return;
      this.mapService.select(id, this.active());
    });

    // Side effect: when the map becomes visible, let Leaflet re-measure it.
    effect(() => {
      if (!this.ready() || !this.active()) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.mapService.invalidateSize(), 0);
    });

    destroyRef.onDestroy(() => {
      clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      this.mapService.destroy();
    });
  }
}
