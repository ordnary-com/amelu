import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * What a pane shows when there's nothing in it, or when it couldn't load.
 * The description goes in as content; buttons marked with an `actions`
 * attribute go underneath it. With `error`, a retry button is offered and
 * the parent decides what retry means.
 */
@Component({
  selector: 'amelu-empty-state',
  template: `
    <div class="flex flex-col items-center px-6 py-12 text-center">
      <div class="max-w-sm">
        <p class="text-[14px] font-semibold" [class.text-bad]="error()">{{ title() }}</p>
        <div class="mt-0.5 text-[13px] leading-relaxed text-muted">
          <ng-content />
        </div>
        <div class="mt-4 flex flex-wrap justify-center gap-2 empty:hidden">
          <ng-content select="[actions]" />
          @if (error()) {
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center rounded-md border border-line px-3 text-[13px] font-medium text-ink hover:bg-bg"
              (click)="retry.emit()"
            >
              Try again
            </button>
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly error = input(false);
  readonly retry = output<void>();
}
