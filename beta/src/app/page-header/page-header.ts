import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';

export interface Crumb {
  label: string;
  /** Omit for the current page. */
  link?: string;
}

/**
 * Breadcrumb, title and a line of description, with buttons on the right.
 * The description goes in as content; buttons or links marked with an
 * `actions` attribute go on the right.
 */
@Component({
  selector: 'amelu-page-header',
  imports: [RouterLink, Icon],
  template: `
    @if (crumbs().length) {
      <nav class="mb-3 flex min-w-0 items-center gap-1 text-[13px] text-muted" aria-label="Breadcrumb">
        @for (crumb of crumbs(); track $index; let last = $last) {
          @if (crumb.link) {
            <a [routerLink]="crumb.link" class="truncate hover:text-ink hover:underline">{{ crumb.label }}</a>
          } @else {
            <span class="truncate text-ink">{{ crumb.label }}</span>
          }
          @if (!last) {
            <amelu-icon name="chevronRight" [size]="12" />
          }
        }
      </nav>
    }
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-[22px] font-bold tracking-[-0.4px]">{{ title() }}</h1>
        <div class="mt-1.5 max-w-2xl text-[13px] text-muted empty:hidden"><ng-content /></div>
      </div>
      <div class="flex flex-wrap gap-2 empty:hidden"><ng-content select="[actions]" /></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-6 block' },
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly crumbs = input<Crumb[]>([]);
}
