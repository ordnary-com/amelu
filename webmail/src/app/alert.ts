import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon, IconName } from './icon';

export type AlertTone = 'error' | 'success' | 'warning';

const TONES: Record<AlertTone, { box: string; icon: IconName }> = {
  error: { box: 'bg-[#d91515] text-white', icon: 'circleX' },
  success: { box: 'bg-[#037f0c] text-white', icon: 'circleCheck' },
  warning: { box: 'bg-[#f2b200] text-[#14171f]', icon: 'circleAlert' },
};

/** A solid banner: bold title, message underneath, optional close button. */
@Component({
  selector: 'amelu-alert',
  imports: [Icon],
  template: `
    <div [class]="'flex items-start gap-2.5 rounded-lg px-4 py-3 ' + tone().box" role="alert">
      <amelu-icon [name]="tone().icon" [size]="18" [strokeWidth]="2.25" class="mt-px" />
      <div class="min-w-0 flex-1 text-[13px]">
        @if (title()) {
          <p class="text-[14px] font-bold">{{ title() }}</p>
        }
        <ng-content />
      </div>
      @if (dismissible()) {
        <button
          type="button"
          class="-mr-1 flex-none cursor-pointer rounded p-1 hover:bg-black/15"
          aria-label="Dismiss"
          (click)="dismissed.emit()"
        >
          <amelu-icon name="close" [size]="16" [strokeWidth]="2.5" />
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Alert {
  readonly kind = input<AlertTone>('error');
  readonly title = input<string>();
  readonly dismissible = input(false);
  readonly dismissed = output<void>();

  protected readonly tone = computed(() => TONES[this.kind()]);
}
