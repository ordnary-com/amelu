import { Injectable, computed, signal } from '@angular/core';

/**
 * The dashboard themes (styles.css). "system" follows the device: dark or
 * light, or the matching high contrast theme when the device asks for more contrast.
 */
export type ThemeChoice = 'dark' | 'dim' | 'black' | 'deep' | 'light' | 'white' | 'sepia' | 'contrast' | 'contrast-dark' | 'system';
export type ThemePalette = Exclude<ThemeChoice, 'system'>;
/** Accent colours, on top of any theme. */
export type AccentChoice = 'blue' | 'purple' | 'green' | 'teal' | 'orange' | 'pink';

const THEME_KEY = 'amelu-theme';
const ACCENT_KEY = 'amelu-accent';
export const THEMES: ThemeChoice[] = ['dark', 'dim', 'black', 'deep', 'light', 'white', 'sepia', 'contrast', 'contrast-dark', 'system'];
export const ACCENTS: AccentChoice[] = ['blue', 'purple', 'green', 'teal', 'orange', 'pink'];
const DARK_PALETTES: ThemePalette[] = ['dark', 'dim', 'black', 'deep', 'contrast-dark'];

/**
 * Dark and blue accent by default. On <html>, `dark` marks every dark theme
 * (Tailwind's dark: variant), `theme-<name>` each theme other than dark and
 * light, and `accent-<name>` each accent other than blue. index.html applies
 * the stored choices before Angular boots, so there's no flash.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly contrastMedia = window.matchMedia('(prefers-contrast: more)');
  private readonly systemDark = signal(this.darkMedia.matches);
  private readonly systemContrast = signal(this.contrastMedia.matches);

  readonly choice = signal<ThemeChoice>(readStored(THEME_KEY, THEMES, 'dark'));
  readonly accent = signal<AccentChoice>(readStored(ACCENT_KEY, ACCENTS, 'blue'));
  /** The theme in use, with "system" resolved. */
  readonly palette = computed<ThemePalette>(() => {
    const choice = this.choice();
    if (choice !== 'system') return choice;
    if (this.systemContrast()) return this.systemDark() ? 'contrast-dark' : 'contrast';
    return this.systemDark() ? 'dark' : 'light';
  });
  /** Whether the theme in use is a dark one. */
  readonly resolved = computed(() => (DARK_PALETTES.includes(this.palette()) ? 'dark' : 'light'));

  constructor() {
    this.darkMedia.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.contrastMedia.addEventListener('change', (event) => {
      this.systemContrast.set(event.matches);
      this.apply();
    });
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    this.apply();
    store(THEME_KEY, choice);
  }

  setAccent(accent: AccentChoice): void {
    this.accent.set(accent);
    this.apply();
    store(ACCENT_KEY, accent);
  }

  private apply(): void {
    const classes = document.documentElement.classList;
    for (const name of [...classes]) if (name.startsWith('theme-') || name.startsWith('accent-')) classes.remove(name);
    classes.toggle('dark', this.resolved() === 'dark');
    const palette = this.palette();
    if (palette !== 'dark' && palette !== 'light') classes.add('theme-' + palette);
    if (this.accent() !== 'blue') classes.add('accent-' + this.accent());
  }
}

function readStored<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    // Fall through to the default.
  }
  return fallback;
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice just won't survive a reload.
  }
}
