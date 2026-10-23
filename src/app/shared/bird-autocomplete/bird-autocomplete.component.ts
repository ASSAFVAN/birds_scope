import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { type BirdSpecies, formatSpecies } from '../../core/models/bird-species.model';
import { SpeciesService } from '../../core/services/species.service';

let nextId = 0;

/**
 * Species picker: filters the cached eBird taxonomy locally by common or
 * scientific name. `selected` is only set when a real taxonomy entry is
 * chosen, so free text can never become a species code.
 */
@Component({
  selector: 'app-bird-autocomplete',
  imports: [MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './bird-autocomplete.component.html',
  styleUrl: './bird-autocomplete.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BirdAutocompleteComponent {
  readonly selected = model<BirdSpecies | null>(null);
  readonly disabled = input(false);
  readonly errorText = input<string | null>(null);
  readonly label = input('Bird species');

  protected readonly speciesService = inject(SpeciesService);
  protected readonly hintId = `bird-ac-hint-${nextId++}`;
  protected readonly format = formatSpecies;
  protected readonly displayWith = (s: BirdSpecies | string | null): string =>
    typeof s === 'string' ? s : formatSpecies(s);

  /** The input text; resets to the formatted selection whenever `selected` changes from outside. */
  protected readonly text = linkedSignal(() => formatSpecies(this.selected()));

  protected readonly suggestions = computed(() => {
    const text = this.text();
    const current = this.selected();
    if (current && text === formatSpecies(current)) return [];
    return this.speciesService.search(text);
  });

  protected readonly showNoMatches = computed(
    () =>
      this.speciesService.status() === 'ready' &&
      this.text().trim().length >= 2 &&
      !this.selected() &&
      this.suggestions().length === 0,
  );

  constructor() {
    void this.speciesService.load();
  }

  protected onInput(value: string): void {
    const current = this.selected();
    if (current && value !== formatSpecies(current)) this.selected.set(null);
    this.text.set(value);
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const species = event.option.value as BirdSpecies | null;
    if (!species) return;
    this.selected.set(species);
    this.text.set(formatSpecies(species));
  }

  protected clear(input: HTMLInputElement): void {
    this.selected.set(null);
    this.text.set('');
    input.value = '';
    input.focus();
  }

  protected retry(): void {
    void this.speciesService.load();
  }
}
