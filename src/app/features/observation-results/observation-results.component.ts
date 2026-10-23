import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { map } from 'rxjs';
import type { ResultView } from '../../core/models/bird-search.model';
import { ObservationSearchStore } from '../../core/state/observation-search.store';
import { ObservationMapComponent } from '../../map/observation-map/observation-map.component';
import { ObservationsTableComponent } from '../../shared/observations-table/observations-table.component';

/**
 * Shared results area for both sections: status messages, coverage note,
 * Map/Table toggle (mobile) or side-by-side layout (wide screens).
 */
@Component({
  selector: 'app-observation-results',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    ObservationMapComponent,
    ObservationsTableComponent,
  ],
  templateUrl: './observation-results.component.html',
  styleUrl: './observation-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationResultsComponent {
  /** Whether this section's tab is currently shown (drives map resize). */
  readonly active = input(true);

  protected readonly store = inject(ObservationSearchStore);

  protected readonly wide = toSignal(
    inject(BreakpointObserver).observe('(min-width: 1100px)').pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly showMap = computed(() => this.wide() || this.store.view() === 'map');
  protected readonly showTable = computed(() => this.wide() || this.store.view() === 'table');
  protected readonly mapActive = computed(() => this.active() && this.showMap());

  protected setView(view: ResultView): void {
    this.store.setView(view);
  }
}
