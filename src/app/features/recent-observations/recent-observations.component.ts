import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { RecentSearchEntry } from '../../core/models/bird-search.model';
import { RecentSearchService } from '../../core/services/recent-search.service';
import { ObservationSearchStore, SEARCH_MODE } from '../../core/state/observation-search.store';
import { BirdAutocompleteComponent } from '../../shared/bird-autocomplete/bird-autocomplete.component';
import { CountrySelectComponent } from '../../shared/country-select/country-select.component';
import { RecentSearchesComponent } from '../../shared/recent-searches/recent-searches.component';
import { ObservationResultsComponent } from '../observation-results/observation-results.component';
import { notifySearchErrors } from '../search-feedback';

@Component({
  selector: 'app-recent-observations',
  imports: [
    BirdAutocompleteComponent,
    CountrySelectComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    ObservationResultsComponent,
    RecentSearchesComponent,
  ],
  providers: [{ provide: SEARCH_MODE, useValue: 'recent' }, ObservationSearchStore],
  templateUrl: './recent-observations.component.html',
  styleUrl: '../search-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentObservationsComponent {
  readonly active = input(true);

  protected readonly store = inject(ObservationSearchStore);
  private readonly recentSearchService = inject(RecentSearchService);
  protected readonly recent = computed(() => this.recentSearchService.entries().filter((e) => e.mode === 'recent'));

  constructor() {
    notifySearchErrors(this.store);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    void this.store.search();
  }

  protected restore(entry: RecentSearchEntry): void {
    void this.store.restore(entry);
  }

  protected clearRecent(): void {
    this.recentSearchService.clear('recent');
  }
}
