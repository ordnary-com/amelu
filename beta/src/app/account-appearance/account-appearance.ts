import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Theme } from '../theme';
import { ACCENT_OPTIONS, THEME_OPTIONS, ThemeOption } from '../theme-options';
import { UI } from '../ui';

/** /account/appearance: the theme and the accent colour. */
@Component({
  selector: 'amelu-account-appearance',
  templateUrl: './account-appearance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block max-w-2xl' },
})
export class AccountAppearance {
  protected readonly theme = inject(Theme);
  protected readonly ui = UI;
  protected readonly options = THEME_OPTIONS;
  protected readonly accents = ACCENT_OPTIONS;

  protected accentColor(): string {
    return ACCENT_OPTIONS.find((a) => a.value === this.theme.accent())!.color;
  }

  /** The miniature's sidebar: the accent for light, a deep shade of it for deep. */
  protected sidebarColor(option: ThemeOption): string {
    if (option.sidebar) return option.sidebar;
    return option.value === 'deep' ? `color-mix(in srgb, ${this.accentColor()} 32%, #070b14)` : this.accentColor();
  }
}
