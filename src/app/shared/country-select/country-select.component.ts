import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CountryService } from '../../core/services/country.service';

/** Country picker that shows names and emits eBird region codes (e.g. "IL"). */
@Component({
  selector: 'app-country-select',
  imports: [MatButtonModule, MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
      <mat-label>Country</mat-label>
      <mat-select
        [value]="code()"
        (valueChange)="code.set($event)"
        [disabled]="disabled() || countryService.status() !== 'ready'"
        panelClass="country-panel"
      >
        @for (c of options(); track c.code) {
          <mat-option [value]="c.code">{{ c.name }} ({{ c.code }})</mat-option>
        }
      </mat-select>
      @if (countryService.status() === 'error') {
        <mat-hint class="error-hint" role="alert">
          {{ countryService.error()?.message }}
          <button mat-button type="button" (click)="countryService.load()">Retry</button>
        </mat-hint>
      } @else if (countryService.status() === 'loading') {
        <mat-hint>Loading countries…</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    :host { display: block; }
    .full-width { width: 100%; }
    .error-hint { color: var(--mat-sys-error); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountrySelectComponent {
  readonly code = model<string>('IL');
  readonly disabled = input(false);
  protected readonly countryService = inject(CountryService);

  /** Keep the current code selectable even before/without the list (e.g. restored search). */
  protected readonly options = computed(() => {
    const list = this.countryService.countries();
    const code = this.code();
    return list.some((c) => c.code === code) || !code ? list : [{ code, name: code }, ...list];
  });

  constructor() {
    void this.countryService.load();
  }
}
