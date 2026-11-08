import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** One on/off setting in a card: label and hint on the left, a switch on the right. Stack them in a `divide-y divide-line` card. */
@Component({
  selector: 'amelu-switch-row',
  template: `
    <label class="flex items-center gap-4 px-4 py-3" [class]="disabled() ? 'cursor-default' : 'cursor-pointer hover:bg-bg/60'">
      <span class="min-w-0 flex-1">
        <span class="block text-[14px] font-medium">{{ label() }}</span>
        <span class="mt-0.5 block text-[12px] leading-relaxed text-muted empty:hidden"><ng-content /></span>
      </span>
      <button
        type="button"
        role="switch"
        class="relative inline-flex h-6 w-10 flex-none cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
        [class]="checked() ? 'bg-accent' : 'bg-line'"
        [attr.aria-checked]="checked()"
        [attr.aria-label]="label()"
        [disabled]="disabled()"
        (click)="checked.set(!checked())"
      >
        <span class="size-5 rounded-full bg-white shadow-sm transition-transform" [class]="checked() ? 'translate-x-[18px]' : 'translate-x-0.5'"></span>
      </button>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SwitchRow {
  readonly label = input.required<string>();
  readonly checked = model(false);
  readonly disabled = input(false);
}
