import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type { HistoricDateValue } from '../../core/models/bird-search.model';
import { NOW } from '../../core/utils/clock';
import { MIN_HISTORIC_YEAR, daysInMonth } from '../../core/utils/date.utils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let nextId = 0;

/**
 * Year / Month / Day selectors for ONE specific date (v1 has no ranges).
 * Validation is done by the store; this component only reports the message.
 */
@Component({
  selector: 'app-historic-date-picker',
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <fieldset class="date-fields" [attr.aria-describedby]="errorText() ? errorId : null">
      <legend class="visually-hidden">Observation date</legend>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Year</mat-label>
        <mat-select [value]="value().year" (valueChange)="patch({ year: $event })" [disabled]="disabled()">
          @for (y of years(); track y) {
            <mat-option [value]="y">{{ y }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Month</mat-label>
        <mat-select [value]="value().month" (valueChange)="patch({ month: $event })" [disabled]="disabled()">
          @for (m of months; track m.value) {
            <mat-option [value]="m.value">{{ m.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Day</mat-label>
        <mat-select [value]="value().day" (valueChange)="patch({ day: $event })" [disabled]="disabled()">
          @for (d of days(); track d.value) {
            <mat-option [value]="d.value" [disabled]="!d.exists">{{ d.value }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </fieldset>
    @if (errorText()) {
      <p class="date-error" [id]="errorId" role="alert">{{ errorText() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .date-fields {
      border: 0; margin: 0; padding: 0; min-width: 0;
      display: grid; grid-template-columns: 1fr 1.4fr 0.9fr; gap: 8px;
    }
    .date-error { margin: 4px 4px 0; color: var(--mat-sys-error); font: var(--mat-sys-body-small); }
    .visually-hidden {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip: rect(0 0 0 0); white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricDatePickerComponent {
  readonly value = model.required<HistoricDateValue>();
  readonly errorText = input<string | null>(null);
  readonly disabled = input(false);

  protected readonly errorId = `date-error-${nextId++}`;
  private readonly now = inject(NOW);

  protected readonly months = MONTHS.map((label, i) => ({ value: i + 1, label }));

  protected readonly years = computed(() => {
    const current = this.now().getFullYear();
    return Array.from({ length: current - MIN_HISTORIC_YEAR + 1 }, (_, i) => current - i);
  });

  /** Always 1–31 so an invalid combination stays visible (and reported) instead of silently changing. */
  protected readonly days = computed(() => {
    const { year, month } = this.value();
    const max = year && month ? daysInMonth(year, month) : 31;
    return Array.from({ length: 31 }, (_, i) => ({ value: i + 1, exists: i + 1 <= max }));
  });

  protected patch(change: Partial<HistoricDateValue>): void {
    this.value.update((v) => ({ ...v, ...change }));
  }
}
