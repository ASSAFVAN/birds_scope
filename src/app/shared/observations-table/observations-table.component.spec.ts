import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { describe, expect, it } from 'vitest';
import { makeObservation } from '../../../testing/fixtures';
import type { Observation } from '../../core/models/observation.model';
import { observationSortAccessor } from './observation-sort';
import { DEFAULT_PAGE_SIZE, ObservationsTableComponent } from './observations-table.component';

function sortIds(data: Observation[], column: string, direction: 'asc' | 'desc'): string[] {
  const ds = new MatTableDataSource(data);
  ds.sortingDataAccessor = observationSortAccessor;
  // sortData only reads `active` and `direction`.
  const sort = { active: column, direction } as MatSort;
  return ds.sortData(data.slice(), sort).map((o) => o.id);
}

describe('observation sorting', () => {
  const data = [
    makeObservation({ id: 'b', commonName: 'barn Owl', count: 10, date: '2025-11-02', time: null, latitude: 31 }),
    makeObservation({ id: 'a', commonName: 'Avocet', count: 2, date: '2025-11-10', time: '07:00', latitude: null }),
    makeObservation({ id: 'c', commonName: 'Coot', count: null, date: '2025-11-10', time: '18:30', latitude: 33 }),
  ];

  it('sorts text case-insensitively', () => {
    expect(sortIds(data, 'commonName', 'asc')).toEqual(['a', 'b', 'c']);
  });

  it('sorts counts numerically with uncounted ("X") lowest', () => {
    expect(sortIds(data, 'count', 'desc')).toEqual(['b', 'a', 'c']);
    expect(sortIds(data, 'count', 'asc')).toEqual(['c', 'a', 'b']);
  });

  it('sorts dates chronologically, including time when present', () => {
    expect(sortIds(data, 'observedAt', 'asc')).toEqual(['b', 'a', 'c']);
    expect(sortIds(data, 'observedAt', 'desc')).toEqual(['c', 'a', 'b']);
  });

  it('handles missing coordinates', () => {
    expect(sortIds(data, 'latitude', 'asc')).toEqual(['a', 'b', 'c']);
  });
});

describe('ObservationsTableComponent', () => {
  async function render(observations: Observation[]) {
    TestBed.configureTestingModule({
      imports: [ObservationsTableComponent],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(ObservationsTableComponent);
    fixture.componentRef.setInput('observations', observations);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const many = Array.from({ length: 60 }, (_, i) =>
    makeObservation({ id: `o${i}`, date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, count: i }),
  );

  it(`paginates with ${DEFAULT_PAGE_SIZE} rows per page by default`, async () => {
    const fixture = await render(many);
    const rows = fixture.nativeElement.querySelectorAll('tr.mat-mdc-row');
    expect(rows.length).toBe(DEFAULT_PAGE_SIZE);
  });

  it('emits rowSelect when a row is clicked', async () => {
    const fixture = await render(many.slice(0, 3));
    const ids: string[] = [];
    fixture.componentInstance.rowSelect.subscribe((id) => ids.push(id));
    (fixture.nativeElement.querySelector('tr.mat-mdc-row') as HTMLElement).click();
    expect(ids).toHaveLength(1);
  });

  it('jumps to the page containing a row selected elsewhere (e.g. from the map)', async () => {
    const fixture = await render(many);
    // Default sort is date descending; find an id that is not on the first page.
    const firstPageIds = [...fixture.nativeElement.querySelectorAll('tr.mat-mdc-row')].map(
      (r) => (r as HTMLElement).dataset['id'],
    );
    const target = many.find((o) => !firstPageIds.includes(o.id))!;

    fixture.componentRef.setInput('selectedId', target.id);
    await fixture.whenStable();
    fixture.detectChanges();

    const selected = fixture.nativeElement.querySelector('tr.selected') as HTMLElement | null;
    expect(selected?.dataset['id']).toBe(target.id);
  });
});
