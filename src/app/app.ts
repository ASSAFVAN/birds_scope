import { ChangeDetectionStrategy, Component, DOCUMENT, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ObservationHistoryComponent } from './features/observation-history/observation-history.component';
import { RecentObservationsComponent } from './features/recent-observations/recent-observations.component';

type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'birdscope.theme';

@Component({
  selector: 'app-root',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
    ObservationHistoryComponent,
    RecentObservationsComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);

  /** 0 = Recent Observations, 1 = Observation History */
  protected readonly activeSection = signal(0);
  protected readonly theme = signal<ThemePreference>(this.readTheme());

  constructor() {
    // Side effect: apply the theme preference to <html> and persist it.
    effect(() => {
      const theme = this.theme();
      const root = this.document.documentElement;
      root.classList.toggle('theme-light', theme === 'light');
      root.classList.toggle('theme-dark', theme === 'dark');
      try {
        globalThis.localStorage?.setItem(THEME_KEY, theme);
      } catch {
        /* storage unavailable */
      }
    });
  }

  protected cycleTheme(): void {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    this.theme.update((t) => order[(order.indexOf(t) + 1) % order.length]!);
  }

  protected themeIcon(): string {
    return { system: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' }[this.theme()];
  }

  private readTheme(): ThemePreference {
    try {
      const value = globalThis.localStorage?.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
