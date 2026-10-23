import { effect, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ObservationSearchStore } from '../core/state/observation-search.store';

/**
 * Side effect shared by both sections: announce search failures in a snackbar
 * (the inline error card stays visible for details and retry).
 * Must be called in an injection context.
 */
export function notifySearchErrors(store: ObservationSearchStore): void {
  const snackBar = inject(MatSnackBar);
  effect(() => {
    const error = store.error();
    if (error) snackBar.open(error.message, 'Dismiss', { duration: 6000, politeness: 'assertive' });
  });
}
