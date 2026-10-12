import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Theme, ThemeChoice } from '../theme';
import { UI } from '../ui';

/** The current dashboard's /account/appearance: light, dark or follow the device. */
@Component({
  selector: 'amelu-account-appearance',
  templateUrl: './account-appearance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block max-w-xl' },
})
export class AccountAppearance {
  protected readonly theme = inject(Theme);
  protected readonly ui = UI;

  protected readonly options: { value: ThemeChoice; label: string; hint: string }[] = [
    { value: 'dark', label: 'Dark', hint: 'The default' },
    { value: 'light', label: 'Light', hint: 'Light panels, blue sidebar' },
    { value: 'system', label: 'System', hint: 'Follows your device' },
  ];
}
