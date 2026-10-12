import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** One on/off setting in a card: label and hint on the left, a switch on the right. */
@Component({
  selector: 'amelu-switch-row',
  template: `
    <label class="flex items-start gap-3 px-4 py-3" [class]="disabled() ? 'cursor-default' : 'cursor-pointer hover:bg-bg/60'">
      <span class="min-w-0 flex-1">
        <span class="block text-[14px] font-medium">{{ label() }}</span>
        <span class="mt-0.5 block text-[12px] leading-relaxed text-muted empty:hidden"><ng-content /></span>
      </span>
      <button
        type="button"
        role="switch"
        class="relative mt-0.5 h-5 w-9 flex-none cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-50"
        [class]="checked() ? 'bg-accent' : 'bg-line'"
        [attr.aria-checked]="checked()"
        [disabled]="disabled()"
        (click)="checked.set(!checked())"
      >
        <span
          class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
          [class.translate-x-4]="checked()"
        ></span>
      </button>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-line last:border-b-0' },
})
export class SwitchRow {
  readonly label = input.required<string>();
  readonly checked = model(false);
  readonly disabled = input(false);
}
