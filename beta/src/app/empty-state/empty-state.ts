import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What a list or card shows when there's nothing in it, or when it couldn't
 * load. The description goes in as content; buttons or links marked with an
 * `actions` attribute go underneath it.
 *
 * `compact` is left-aligned with less padding, for the narrow side cards.
 */
@Component({
  selector: 'amelu-empty-state',
  template: `
    <div [class]="compact() ? 'px-4 py-4' : 'flex flex-col items-center px-6 py-12 text-center'">
      <div [class]="compact() ? '' : 'max-w-sm'">
        <p class="text-[14px] font-semibold" [class.text-bad]="error()">{{ title() }}</p>
        <div class="mt-0.5 text-[13px] leading-relaxed text-muted">
          <ng-content />
          @if (error()) {
            Try again in a moment.
          }
        </div>
        <div class="flex flex-wrap gap-2 empty:hidden" [class]="compact() ? 'mt-2.5' : 'mt-4 justify-center'">
          <ng-content select="[actions]" />
          @if (error()) {
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center rounded-md border border-line px-3 text-[13px] font-medium text-ink hover:bg-bg"
              (click)="reload()"
            >
              Reload
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
  readonly compact = input(false);
  /** The request failed: red title and a reload button. */
  readonly error = input(false);

  // None of these pages keep unsaved input next to a failed list, so a full reload is safe.
  protected reload() {
    location.reload();
  }
}
