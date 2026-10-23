import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';
import { type Observation, formatCount, formatObservedAt } from '../../core/models/observation.model';
import { observationSortAccessor } from './observation-sort';

export const DEFAULT_PAGE_SIZE = 25;
const ALL_COLUMNS = ['commonName', 'scientificName', 'locationName', 'count', 'observedAt', 'latitude', 'longitude'] as const;
const COMPACT_COLUMNS = ['commonName', 'locationName', 'count', 'observedAt'] as const;

/** Sortable, paginated observation table. Row clicks select; external selection jumps to the row's page. */
@Component({
  selector: 'app-observations-table',
  imports: [MatIconModule, MatPaginatorModule, MatSortModule, MatTableModule, MatTooltipModule],
  templateUrl: './observations-table.component.html',
  styleUrl: './observations-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationsTableComponent {
  readonly observations = input.required<readonly Observation[]>();
  readonly selectedId = input<string | null>(null);
  readonly rowSelect = output<string>();

  protected readonly pageSize = DEFAULT_PAGE_SIZE;
  protected readonly pageSizeOptions = [10, 25, 50, 100];
  protected readonly formatCount = formatCount;
  protected readonly formatObservedAt = formatObservedAt;
  protected readonly dataSource = new MatTableDataSource<Observation>([]);

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);
  private readonly rows = viewChildren('row', { read: ElementRef<HTMLElement> });

  private readonly compact = toSignal(
    inject(BreakpointObserver).observe('(max-width: 719.98px)').pipe(map((s) => s.matches)),
    { initialValue: false },
  );
  protected readonly displayedColumns = computed<readonly string[]>(() => (this.compact() ? COMPACT_COLUMNS : ALL_COLUMNS));
  private readonly wired = signal(false);

  constructor() {
    this.dataSource.sortingDataAccessor = observationSortAccessor;

    afterNextRender(() => {
      this.dataSource.sort = this.sort() ?? null;
      this.dataSource.paginator = this.paginator() ?? null;
      this.wired.set(true);
    });

    // Side effect: push new results into the Material data source (imperative API).
    effect(() => {
      this.dataSource.data = [...this.observations()];
      this.paginator()?.firstPage();
    });

    // Side effect: when selection changes (e.g. from a map marker), show that row's page.
    effect(() => {
      const id = this.selectedId();
      if (!this.wired() || !id) return;
      this.revealRow(id);
    });
  }

  protected onRowClick(row: Observation): void {
    this.rowSelect.emit(row.id);
  }

  protected onRowKey(event: KeyboardEvent, row: Observation): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.rowSelect.emit(row.id);
    }
  }

  private revealRow(id: string): void {
    const paginator = this.paginator();
    if (!paginator) return;
    const sort = this.dataSource.sort;
    const data = this.dataSource.filteredData.slice();
    const ordered = sort ? this.dataSource.sortData(data, sort) : data;
    const index = ordered.findIndex((o) => o.id === id);
    if (index < 0) return;
    const page = Math.floor(index / paginator.pageSize);
    if (page !== paginator.pageIndex) {
      const previousPageIndex = paginator.pageIndex;
      paginator.pageIndex = page;
      paginator.page.emit({ pageIndex: page, previousPageIndex, pageSize: paginator.pageSize, length: paginator.length });
    }
    // Scroll after the page re-renders.
    setTimeout(() => {
      this.rows()
        .find((r) => r.nativeElement.dataset['id'] === id)
        ?.nativeElement.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
  }
}
