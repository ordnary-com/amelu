import { Injectable, computed, signal } from '@angular/core';

export type ThemeChoice = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'amelu-theme';

/**
 * Dark by default. "system" follows the device and switches along with it.
 * index.html applies the stored choice before Angular boots, so there's no flash.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);

  readonly choice = signal<ThemeChoice>(readStored());
  readonly resolved = computed(() => {
    const choice = this.choice();
    return choice === 'system' ? (this.systemDark() ? 'dark' : 'light') : choice;
  });

  constructor() {
    this.media.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Private mode or blocked storage: the choice just won't survive a reload.
    }
  }

  private apply(): void {
    document.documentElement.classList.toggle('dark', this.resolved() === 'dark');
  }
}

function readStored(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'system') return stored;
  } catch {
    // Fall through to the default.
  }
  return 'dark';
}
