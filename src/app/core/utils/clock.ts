import { InjectionToken } from '@angular/core';

/** Current time source; overridden in tests to make "today" deterministic. */
export const NOW = new InjectionToken<() => Date>('NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
