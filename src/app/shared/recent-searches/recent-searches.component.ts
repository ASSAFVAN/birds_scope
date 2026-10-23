import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { RecentSearchEntry } from '../../core/models/bird-search.model';
import { formatHistoricDate } from '../../core/utils/date.utils';

/** Compact, collapsible list of recent searches. Clicking an entry reruns it. */
@Component({
  selector: 'app-recent-searches',
  imports: [DatePipe, MatButtonModule, MatExpansionModule, MatIconModule, MatListModule, MatTooltipModule],
  template: `
    <mat-expansion-panel class="recent-panel" [expanded]="false">
      <mat-expansion-panel-header>
        <mat-panel-title>
          <mat-icon aria-hidden="true">history</mat-icon>
          Recent searches
        </mat-panel-title>
        <mat-panel-description>{{ entries().length }} saved</mat-panel-description>
      </mat-expansion-panel-header>

      @if (entries().length === 0) {
        <p class="empty">Your last 10 searches will appear here.</p>
      } @else {
        <mat-action-list dense aria-label="Recent searches">
          @for (e of entries(); track e.timestamp) {
            <button mat-list-item type="button" (click)="searchSelected.emit(e)" [disabled]="disabled()">
              <mat-icon matListItemIcon aria-hidden="true">{{ e.mode === 'history' ? 'event' : 'schedule' }}</mat-icon>
              <span matListItemTitle>{{ e.commonName ?? 'All species' }} · {{ e.countryCode }}</span>
              <span matListItemLine class="meta">
                @if (e.date) {
                  {{ dateLabel(e) }} ·
                }
                @if (e.scientificName) {
                  <em>{{ e.scientificName }}</em> ·
                }
                searched {{ e.timestamp | date: 'MMM d, HH:mm' }}
              </span>
            </button>
          }
        </mat-action-list>
        <div class="actions">
          <button mat-button type="button" (click)="clearRequested.emit()" matTooltip="Remove all recent searches in this section">
            <mat-icon>delete_sweep</mat-icon>
            Clear recent searches
          </button>
        </div>
      }
    </mat-expansion-panel>
  `,
  styles: `
    :host { display: block; }
    mat-panel-title { display: flex; align-items: center; gap: 8px; }
    .empty { margin: 0; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-medium); }
    .meta { color: var(--mat-sys-on-surface-variant); }
    .actions { display: flex; justify-content: flex-end; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentSearchesComponent {
  readonly entries = input.required<readonly RecentSearchEntry[]>();
  readonly disabled = input(false);
  readonly searchSelected = output<RecentSearchEntry>();
  readonly clearRequested = output<void>();

  protected dateLabel(e: RecentSearchEntry): string {
    return e.date ? formatHistoricDate(e.date) : '';
  }
}
