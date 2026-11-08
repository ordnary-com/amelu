import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Theme, ThemeChoice } from '../theme';
import { ACCENT_OPTIONS, THEME_OPTIONS, ThemeOption } from '../theme-options';
import { UI } from '../ui';
import { Icon } from '../icon';

// How the theme grid is grouped; System sits above them on its own.
const GROUPS: { label: string; values: ThemeChoice[] }[] = [
  { label: 'Dark', values: ['dark', 'dim', 'black', 'deep'] },
  { label: 'Light', values: ['light', 'white', 'sepia'] },
  { label: 'High contrast', values: ['contrast', 'contrast-dark'] },
];

const DARK_PANES = ['dark', 'dim', 'black', 'deep', 'contrast-dark'];

/** /account/appearance: the theme and the accent colour, with a live preview. */
@Component({
  selector: 'amelu-account-appearance',
  imports: [Icon, NgTemplateOutlet],
  templateUrl: './account-appearance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AccountAppearance {
  protected readonly theme = inject(Theme);
  protected readonly ui = UI;
  protected readonly accents = ACCENT_OPTIONS;
  protected readonly systemOption = THEME_OPTIONS.find((o) => o.value === 'system')!;
  protected readonly groups = GROUPS.map((group) => ({
    label: group.label,
    options: group.values.map((value) => THEME_OPTIONS.find((o) => o.value === value)!),
  }));

  protected readonly isDefault = computed(() => this.theme.choice() === 'dark' && this.theme.accent() === 'blue');

  protected accentColor(): string {
    return ACCENT_OPTIONS.find((a) => a.value === this.theme.accent())!.color;
  }

  /** The miniature's sidebar: the accent for light, a deep shade of it for deep. */
  protected sidebarColor(option: ThemeOption): string {
    if (option.sidebar) return option.sidebar;
    return option.value === 'deep' ? `color-mix(in srgb, ${this.accentColor()} 32%, #070b14)` : this.accentColor();
  }

  /** The menu lines on the miniature's sidebar: white on a dark or coloured sidebar, dark on a light one. */
  protected lineColor(option: ThemeOption): string {
    const light = option.sidebar !== null && ['#ffffff', '#f2ebdf'].includes(option.sidebar);
    return light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.45)';
  }

  protected inkColor(option: ThemeOption, alpha: number): string {
    return DARK_PANES.includes(option.value) ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
  }

  protected reset(): void {
    this.theme.set('dark');
    this.theme.setAccent('blue');
  }
}
